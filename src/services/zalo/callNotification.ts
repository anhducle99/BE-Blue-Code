import { zaloOAService } from './zaloOAService';
import { prisma } from '../../models/db';
import { getIO } from '../../socketStore';


export async function sendZaloNotificationsForCall(
  callId: string,
  targetNames: string[],
  fromDept: string,
  message?: string,
  organizationId?: number
): Promise<{ sent: number; failed: number; details: any[] }> {
  const results: any[] = [];
  let sent = 0;
  let failed = 0;

  try {
    const linkedUsers = await prisma.user.findMany({
      where: {
        name: { in: targetNames },
        zaloVerified: true,
        zaloUserId: { not: null },
        ...(organizationId ? { organizationId: organizationId } : {})
      },
      select: {
        id: true,
        name: true,
        zaloUserId: true,
        departmentId: true,
      }
    });

    if (linkedUsers.length === 0) {
      console.log(`[ZaloNotify] No linked users found for call ${callId}`);
      return { sent: 0, failed: 0, details: [] };
    }

    console.log(`[ZaloNotify] Sending notifications to ${linkedUsers.length} users for call ${callId}`);

    for (const user of linkedUsers) {
      try {
        if (!user.zaloUserId) continue;

        await zaloOAService.sendEmergencyCallNotification({
          user_id: user.zaloUserId,
          callId,
          fromDept,
          message,
        });

        results.push({
          userId: user.id,
          name: user.name,
          status: 'sent',
          zaloUserId: user.zaloUserId
        });
        sent++;

      } catch (error: any) {
        console.error(`[ZaloNotify] Failed to send to ${user.name}:`, error.message);
        results.push({
          userId: user.id,
          name: user.name,
          status: 'failed',
          error: error.message
        });
        failed++;
      }
    }

    console.log(`[ZaloNotify] Call ${callId}: ${sent} sent, ${failed} failed`);

  } catch (error: any) {
    console.error('[ZaloNotify] Error sending notifications:', error);
  }

  return { sent, failed, details: results };
}


export async function sendZaloStatusUpdate(
  callId: string,
  status: 'accepted' | 'rejected' | 'timeout' | 'cancelled',
  organizationId?: number
): Promise<void> {
  try {
    const callLogs = await prisma.callLog.findMany({
      where: { callId },
      select: { toUser: true }
    });

    const receiverNames = callLogs.map(log => log.toUser);

    const linkedUsers = await prisma.user.findMany({
      where: {
        name: { in: receiverNames },
        zaloVerified: true,
        zaloUserId: { not: null },
        ...(organizationId ? { organizationId: organizationId } : {})
      },
      select: {
        name: true,
        zaloUserId: true,
      }
    });

    for (const user of linkedUsers) {
      if (user.zaloUserId) {
        await zaloOAService.sendCallStatusNotification(
          user.zaloUserId,
          callId,
          status
        );
      }
    }
  } catch (error) {
    console.error('[ZaloNotify] Error sending status update:', error);
  }
}


export function setupCallTimeout(
  callId: string,
  targetUsers: string[],
  timeoutMs: number = 17000,  
  organizationId?: number
): NodeJS.Timeout {
  return setTimeout(async () => {
    try {
      const acceptedLogs = await prisma.callLog.findMany({
        where: { callId, status: 'accepted' }
      });

      if (acceptedLogs.length > 0) {
        return;
      }

      const pendingLogs = await prisma.callLog.findMany({
        where: { callId, status: 'pending' }
      });

      for (const log of pendingLogs) {
        await prisma.callLog.update({
          where: { id: log.id },
          data: {
            status: 'timeout',
            rejectedAt: new Date()
          }
        });
      }

      const io = getIO();
      if (io && organizationId) {
        pendingLogs.forEach(log => {
          io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
            callId,
            toDept: log.toUser,
            toUser: log.toUser,
            status: 'timeout'
          });
        });
      }

  

      console.log(`[CallTimeout] Call ${callId} timed out after ${timeoutMs}ms`);

    } catch (error) {
      console.error('[CallTimeout] Error:', error);
    }
  }, timeoutMs);
}
