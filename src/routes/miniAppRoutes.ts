import { Router } from "express";
import { prisma } from "../models/db";
import { CallLogModel } from "../models/CallLog";
import { getIO, emitCallLogUpdated } from "../socketStore";
import { zaloOAService } from "../services/zalo/zaloOAService";
import jwt from "jsonwebtoken";
import axios from "axios";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const ZALO_APP_ID = process.env.ZALO_APP_ID || "";
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET || "";

export const miniAppAuthMiddleware = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        departmentId: true,
        zaloUserId: true,
        zaloVerified: true,
      },
    });

    if (!user || !user.zaloVerified) {
      return res.status(401).json({ error: "User not found or Zalo not linked" });
    }

    req.miniUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

router.post("/auth/login", async (req, res) => {
  try {
    const { accessToken, codeVerifier } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Missing accessToken",
      });
    }

    let zaloUserId: string;
    let zaloUserInfo: any;

    try {
      const profileRes = await axios.get(
        "https://graph.zalo.me/v2.0/me?fields=id,name,picture",
        {
          headers: {
            access_token: accessToken,
          },
        }
      );

      if (profileRes.data.error) {
        throw new Error(profileRes.data.error.message);
      }

      zaloUserId = profileRes.data.id;
      zaloUserInfo = profileRes.data;
    } catch (error: any) {
      console.error("[MiniAppAuth] Zalo API error:", error.response?.data || error.message);
      
      if (process.env.NODE_ENV === "development" && req.body.mockMode) {
        zaloUserId = req.body.mockZaloUserId || "mock_zalo_user_123";
        zaloUserInfo = { id: zaloUserId, name: "Mock User" };
        console.log("[MiniAppAuth] Using mock mode with zaloUserId:", zaloUserId);
      } else {
        return res.status(401).json({
          success: false,
          message: "Invalid Zalo access token",
          error: error.message,
        });
      }
    }

    const user = await prisma.user.findFirst({
      where: {
        zaloUserId: zaloUserId,
        zaloVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        departmentId: true,
        zaloUserId: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản chưa được liên kết với Zalo. Vui lòng liên kết trước trong ứng dụng web.",
        code: "NOT_LINKED",
        zaloUserId: zaloUserId,
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        zaloUserId: user.zaloUserId,
        type: "mini_app",
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login thành công",
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          departmentId: user.departmentId,
        },
        zaloUserInfo: {
          id: zaloUserInfo.id,
          name: zaloUserInfo.name,
          picture: zaloUserInfo.picture,
        },
      },
    });
  } catch (error: any) {
    console.error("[MiniAppAuth] Login error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi đăng nhập",
      error: error.message,
    });
  }
});

router.post("/auth/verify", miniAppAuthMiddleware, async (req: any, res) => {
  res.json({
    success: true,
    user: req.miniUser,
  });
});


router.get("/my-calls", miniAppAuthMiddleware, async (req: any, res) => {
  try {
    const user = req.miniUser;
    const { status = "pending", limit = "10" } = req.query;

    const calls = await prisma.callLog.findMany({
      where: {
        toUser: user.name,
        ...(status !== "all" ? { status: status as string } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: parseInt(limit as string),
    });

    const formattedCalls = calls.map((call: any) => ({
      id: call.id,
      callId: call.callId,
      fromUser: call.fromUser,
      toUser: call.toUser,
      message: call.message,
      imageUrl: call.imageUrl,
      status: call.status,
      createdAt: call.createdAt,
      acceptedAt: call.acceptedAt,
      rejectedAt: call.rejectedAt,
    }));

    res.json({
      success: true,
      data: formattedCalls,
    });
  } catch (error: any) {
    console.error("[MiniApp] Get my calls error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách cuộc gọi",
      error: error.message,
    });
  }
});


router.get("/calls/:callId", miniAppAuthMiddleware, async (req: any, res) => {
  try {
    const user = req.miniUser;
    const { callId } = req.params;

    const call = await prisma.callLog.findFirst({
      where: {
        callId,
        toUser: user.name,
      },
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc gọi",
      });
    }

    res.json({
      success: true,
      data: {
        id: call.id,
        callId: call.callId,
        fromUser: call.fromUser,
        toUser: call.toUser,
        message: call.message,
        imageUrl: call.imageUrl,
        status: call.status,
        createdAt: call.createdAt,
        acceptedAt: call.acceptedAt,
        rejectedAt: call.rejectedAt,
      },
    });
  } catch (error: any) {
    console.error("[MiniApp] Get call detail error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy chi tiết cuộc gọi",
      error: error.message,
    });
  }
});

router.post("/calls/:callId/accept", miniAppAuthMiddleware, async (req: any, res) => {
  try {
    const user = req.miniUser;
    const { callId } = req.params;

    const callLog = await prisma.callLog.findFirst({
      where: {
        callId,
        toUser: user.name,
        status: "pending",
      },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Cuộc gọi không tồn tại hoặc đã được xử lý",
      });
    }

    const updated = await CallLogModel.updateStatus(callId, user.name, "accepted");

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: "Không thể cập nhật trạng thái. Có thể cuộc gọi đã được xử lý.",
      });
    }

    const io = getIO();
    if (io && user.organizationId) {
      io.to(`organization_${user.organizationId}`).emit("callStatusUpdate", {
        callId,
        toDept: user.name,
        toUser: user.name,
        status: "accepted",
      });

      emitCallLogUpdated(
        {
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
        },
        user.organizationId
      );
    }

    await cancelOtherPendingCalls(callId, user.name, user.organizationId);

    res.json({
      success: true,
      message: "Đã nhận cuộc gọi thành công",
      data: {
        callId,
        status: "accepted",
        acceptedAt: updated.accepted_at,
      },
    });
  } catch (error: any) {
    console.error("[MiniApp] Accept call error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi xử lý",
      error: error.message,
    });
  }
});


router.post("/calls/:callId/reject", miniAppAuthMiddleware, async (req: any, res) => {
  try {
    const user = req.miniUser;
    const { callId } = req.params;

    const callLog = await prisma.callLog.findFirst({
      where: {
        callId,
        toUser: user.name,
        status: "pending",
      },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Cuộc gọi không tồn tại hoặc đã được xử lý",
      });
    }

    const updated = await CallLogModel.updateStatus(callId, user.name, "rejected");

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: "Không thể cập nhật trạng thái",
      });
    }

    const io = getIO();
    if (io && user.organizationId) {
      io.to(`organization_${user.organizationId}`).emit("callStatusUpdate", {
        callId,
        toDept: user.name,
        toUser: user.name,
        status: "rejected",
      });

      emitCallLogUpdated(
        {
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
        },
        user.organizationId
      );
    }

    res.json({
      success: true,
      message: "Đã từ chối cuộc gọi",
      data: {
        callId,
        status: "rejected",
        rejectedAt: updated.rejected_at,
      },
    });
  } catch (error: any) {
    console.error("[MiniApp] Reject call error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi xử lý",
      error: error.message,
    });
  }
});


async function cancelOtherPendingCalls(
  callId: string,
  acceptedBy: string,
  organizationId?: number | null
) {
  try {
    const pendingLogs = await prisma.callLog.findMany({
      where: {
        callId,
        status: "pending",
        toUser: { not: acceptedBy },
      },
    });

    for (const log of pendingLogs) {
      await CallLogModel.updateStatus(callId, log.toUser, "cancelled");

      const otherUser = await prisma.user.findFirst({
        where: { name: log.toUser, zaloVerified: true },
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
      pendingLogs.forEach((log: any) => {
        io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
          callId,
          toDept: log.toUser,
          toUser: log.toUser,
          status: "cancelled",
        });
      });
    }
  } catch (error) {
    console.error("[MiniApp] Cancel other pending error:", error);
  }
}

export default router;
