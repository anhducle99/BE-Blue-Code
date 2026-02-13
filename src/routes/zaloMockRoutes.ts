import { Router } from "express";
import { zaloMockService } from "../services/zalo/zaloMockService";
import { zaloLinkService } from "../services/zalo";
import { prisma } from "../models/db";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();


router.get("/mock/status", (req, res) => {
  const isMock = zaloMockService.isEnabled();
  res.json({
    mockMode: isMock,
    message: isMock 
      ? "Đang chạy ở MOCK MODE - Không gửi Zalo thật" 
      : "Đang chạy ở PRODUCTION MODE - Gửi Zalo thật",
    hint: isMock ? "Xem log server để thấy messages" : null,
  });
});


router.get("/mock/messages", (req, res) => {
  if (!zaloMockService.isEnabled()) {
    return res.status(400).json({
      error: "Mock mode không được bật. Set USE_ZALO_MOCK=true hoặc bỏ ZALO_OA_TOKEN",
    });
  }

  const messages = zaloMockService.getMockMessages();
  res.json({
    count: messages.length,
    messages,
  });
});


router.post("/mock/clear", (req, res) => {
  zaloMockService.clearMockMessages();
  res.json({ message: "Đã xóa mock messages" });
});

router.post("/mock/simulate-link", async (req, res) => {
  try {
    const { code, zaloUserId } = req.body;
    
    if (!code || !zaloUserId) {
      return res.status(400).json({
        error: "Thiếu code hoặc zaloUserId",
        example: {
          code: "123456",
          zaloUserId: "mock_zalo_user_123",
        },
      });
    }

    const result = await zaloLinkService.verifyAndLink(code, zaloUserId);
    
    res.json({
      success: result.success,
      message: result.message,
      userId: result.userId,
      note: "User đã được link với Zalo (mock)",
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});


router.post("/mock/simulate-action", async (req, res) => {
  try {
    const { zaloUserId, action, callId } = req.body;
    
    if (!zaloUserId || !action || !callId) {
      return res.status(400).json({
        error: "Thiếu thông tin",
        required: ["zaloUserId", "action (ACCEPT/REJECT)", "callId"],
        example: {
          zaloUserId: "mock_zalo_user_123",
          action: "ACCEPT",
          callId: "call-uuid-here",
        },
      });
    }

    const mockPayload = {
      event: 'user_send_text',
      sender: { id: zaloUserId },
      message: { text: `${action} ${callId}` },
      event_id: `mock_event_${Date.now()}`,
    };

    res.json({
      success: true,
      message: "Payload sẵn sàng",
      instruction: "POST payload này đến /api/zalo/webhook để xử lý",
      payload: mockPayload,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

router.post("/mock/force-link", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { zaloUserId } = req.body;

    if (!userId || !zaloUserId) {
      return res.status(400).json({
        error: "Thiếu userId hoặc zaloUserId",
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        zaloUserId: zaloUserId,
        zaloVerified: true,
        zaloLinkedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `Đã force link user ${userId} với Zalo ${zaloUserId}`,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});


router.post("/mock/test-notification", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.zaloUserId) {
      return res.status(400).json({
        error: "User chưa link Zalo",
        hint: "Dùng /api/zalo/mock/force-link trước",
      });
    }

    const result = await zaloMockService.sendEmergencyCallNotification({
      user_id: user.zaloUserId,
      callId: `test-${Date.now()}`,
      fromDept: "Test Department",
      message: "Đây là thông báo test",
    });

    res.json({
      success: true,
      mockResult: result,
      message: "Đã gửi mock notification (xem log server)",
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;
