import { Router } from "express";
import { zaloOAService, zaloLinkService } from "../services/zalo";
import { CallLogModel } from "../models/CallLog";
import { prisma } from "../models/db";
import { getIO, emitCallLogUpdated } from "../socketStore";

const router = Router();

router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers['x-zalo-signature'] as string;
    const timestamp = req.headers['x-zalo-timestamp'] as string;
    const body = JSON.stringify(req.body);

    const isMockMode = !process.env.ZALO_OA_TOKEN || process.env.USE_ZALO_MOCK === 'true';
    if (!isMockMode && signature) {
      if (!zaloOAService.verifyWebhookSignature(body, signature, timestamp)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { event, sender, message, user_id, event_id } = req.body;

    if (event_id) {
      const existingEvent = await prisma.zaloEventLog.findUnique({
        where: { eventId: event_id }
      });
      if (existingEvent) {
        return res.status(200).json({ message: 'Event already processed' });
      }
    }

    await prisma.zaloEventLog.create({
      data: {
        eventId: event_id || `${Date.now()}_${Math.random()}`,
        eventName: event || 'unknown',
        zaloUserId: user_id || sender?.id,
        payload: req.body,
      }
    });

    switch (event) {
      case 'user_send_text':
        await handleUserSendText(sender.id, message.text);
        break;
        
      case 'follow':
        console.log(`[ZaloWebhook] User ${user_id} followed OA`);
        break;
        
      case 'unfollow':
        await handleUnfollow(user_id);
        break;
        
      default:
        console.log(`[ZaloWebhook] Unhandled event: ${event}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (error: any) {
    console.error("[ZaloWebhook] Error:", error);
    res.status(200).json({ message: 'Processed with error' });
  }
});

async function handleUserSendText(zaloUserId: string, text: string) {
  const trimmedText = text.trim().toUpperCase();
  
  const linkMatch = trimmedText.match(/^LINK\s+(\d{6})$/);
  if (linkMatch) {
    const code = linkMatch[1];
    const result = await zaloLinkService.verifyAndLink(code, zaloUserId);
    
    await zaloOAService.sendTextMessage(
      zaloUserId,
      result.success 
        ? `✅ ${result.message}\nTừ giờ bạn sẽ nhận được thông báo sự cố qua Zalo.`
        : `❌ ${result.message}\nVui lòng thử lại.`
    );
    return;
  }

  const actionMatch = trimmedText.match(/^(ACCEPT|REJECT|NHẬN|TỪ CHỐI)\s+(\S+)$/i);
  if (actionMatch) {
    const action = actionMatch[1].toUpperCase();
    const callId = actionMatch[2];
    
    const normalizedAction = action === 'NHẬN' ? 'ACCEPT' : 
                             action === 'TỪ CHỐI' ? 'REJECT' : action;
    
    await handleCallAction(zaloUserId, callId, normalizedAction as 'ACCEPT' | 'REJECT');
    return;
  }

  await zaloOAService.sendTextMessage(
    zaloUserId,
    `👋 Xin chào!\n\nCách sử dụng:\n1. Để link tài khoản: gửi LINK <mã 6 số>\n2. Khi có cuộc gọi khẩn cấp, bạn sẽ nhận được thông báo với nút NHẬN hoặc TỪ CHỐI.\n\nHỗ trợ: contact@bluecode.vn`
  );
}


async function handleCallAction(zaloUserId: string, callId: string, action: 'ACCEPT' | 'REJECT') {
  try {
    const user = await prisma.user.findFirst({
      where: { zaloUserId: zaloUserId },
      include: { organization: true }
    });

    if (!user) {
      await zaloOAService.sendTextMessage(zaloUserId, '❌ Tài khoản chưa được link. Vui lòng link trước bằng cách gửi LINK <mã>');
      return;
    }

    const callLog = await prisma.callLog.findFirst({
      where: {
        callId,
        toUser: user.name,
        status: 'pending'
      }
    });

    if (!callLog) {
      await zaloOAService.sendTextMessage(zaloUserId, '❌ Cuộc gọi không tồn tại hoặc đã được xử lý');
      return;
    }

    const newStatus = action === 'ACCEPT' ? 'accepted' : 'rejected';
    
    const updated = await CallLogModel.updateStatus(callId, user.name, newStatus as any);
    
    if (!updated) {
      await zaloOAService.sendTextMessage(zaloUserId, '❌ Không thể cập nhật trạng thái. Có thể cuộc gọi đã được xử lý bởi ngưởi khác.');
      return;
    }

    const io = getIO();
    if (io && user.organizationId) {
      io.to(`organization_${user.organizationId}`).emit("callStatusUpdate", {
        callId,
        toDept: user.name,
        toUser: user.name,
        status: newStatus
      });

      emitCallLogUpdated({
        id: updated.id,
        call_id: updated.call_id,
        from_user: updated.from_user,
        to_user: updated.to_user,
        message: updated.message,
        image_url: updated.image_url,
        status: updated.status,
        created_at: updated.created_at,
        accepted_at: updated.accepted_at,
        rejected_at: updated.rejected_at,
      }, user.organizationId);
    }

    if (action === 'ACCEPT') {
      await cancelOtherPendingCalls(callId, user.name, user.organizationId);
      await zaloOAService.sendTextMessage(zaloUserId, `✅ Bạn đã nhận cuộc gọi ${callId}`);
    } else {
      await zaloOAService.sendTextMessage(zaloUserId, `❌ Bạn đã từ chối cuộc gọi ${callId}`);
    }

  } catch (error) {
    console.error('[ZaloWebhook] Handle call action error:', error);
    await zaloOAService.sendTextMessage(zaloUserId, '❌ Lỗi xử lý. Vui lòng thử lại sau.');
  }
}


async function cancelOtherPendingCalls(callId: string, acceptedBy: string, organizationId?: number | null) {
  try {
    const pendingLogs = await prisma.callLog.findMany({
      where: {
        callId,
        status: 'pending',
        toUser: { not: acceptedBy }
      }
    });

    for (const log of pendingLogs) {
      await CallLogModel.updateStatus(callId, log.toUser, 'cancelled');
      
      const otherUser = await prisma.user.findFirst({
        where: { name: log.toUser, zaloVerified: true }
      });
      
      if (otherUser?.zaloUserId) {
        await zaloOAService.sendTextMessage(
          otherUser.zaloUserId,
          `ℹ️ Cuộc gọi ${callId} đã được ${acceptedBy} nhận xử lý.`
        );
      }
    }

    const io = getIO();
    if (io && organizationId) {
      pendingLogs.forEach(log => {
        io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
          callId,
          toDept: log.toUser,
          toUser: log.toUser,
          status: 'cancelled'
        });
      });
    }
  } catch (error) {
    console.error('[ZaloWebhook] Cancel other pending error:', error);
  }
}


async function handleUnfollow(zaloUserId: string) {
  // Option: Tự động unlink khi unfollow
  // await prisma.user.updateMany({
  //   where: { zaloUserId: zaloUserId },
  //   data: { zaloVerified: false }
  // });
  console.log(`[ZaloWebhook] User ${zaloUserId} unfollowed OA`);
}

export default router;
