import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { zaloLinkService } from "../services/zalo";
import { prisma } from "../models/db";

const router = Router();

router.post("/link/request", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const userFull = (req as any).userFull;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin ngưởi dùng"
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { zaloVerified: true, zaloUserId: true }
    });

    if (existing?.zaloVerified) {
      return res.status(400).json({
        success: false,
        message: "Tài khoản đã được link với Zalo",
        zaloUserId: existing.zaloUserId
      });
    }

    const code = await zaloLinkService.generateLinkCode(
      userId, 
      userFull?.organizationId
    );

    res.json({
      success: true,
      code,
      expiryMinutes: 5,
      instruction: `Vui lòng mở Zalo, tìm OA và gửi tin nhắn: LINK ${code}`
    });
  } catch (error: any) {
    console.error("[ZaloRoutes] Generate link code error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi tạo mã link"
    });
  }
});


router.post("/link/unlink", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin ngưởi dùng"
      });
    }

    const success = await zaloLinkService.unlinkUser(userId);
    
    if (success) {
      res.json({
        success: true,
        message: "Đã hủy link Zalo thành công"
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Lỗi hủy link"
      });
    }
  } catch (error: any) {
    console.error("[ZaloRoutes] Unlink error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống"
    });
  }
});

router.get("/status", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin ngưởi dùng"
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        zaloUserId: true,
        zaloVerified: true,
        zaloLinkedAt: true,
      }
    });

    res.json({
      success: true,
      isLinked: user?.zaloVerified || false,
      zaloUserId: user?.zaloUserId || null,
      linkedAt: user?.zaloLinkedAt || null
    });
  } catch (error: any) {
    console.error("[ZaloRoutes] Get status error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy trạng thái"
    });
  }
});


router.get("/linked-users", authMiddleware, async (req, res) => {
  try {
    const userFull = (req as any).userFull;
    
    if (!userFull?.organization_id) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập"
      });
    }

    const users = await zaloLinkService.getLinkedUsers(userFull.organization_id);
    
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error: any) {
    console.error("[ZaloRoutes] Get linked users error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách"
    });
  }
});

export default router;
