import { Router } from "express";
import { prisma } from "../models/db";
import { CallLogModel } from "../models/CallLog";
import { getIO, emitCallLogUpdated } from "../socketStore";
import jwt from "jsonwebtoken";
import axios from "axios";
import { authMiddleware } from "../middleware/authMiddleware";
import { approveQrLoginSession, getQrLoginSession } from "../services/qrLoginSessionStore";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const MINI_APP_WEB_URL = process.env.MINI_APP_WEB_URL || "http://localhost:3001";
const ZALO_MINI_APP_ID = process.env.ZALO_MINI_APP_ID || "";
const MINI_APP_LAUNCH_MODE = (process.env.MINI_APP_LAUNCH_MODE || "web").toLowerCase();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MINI_APP_TESTING_VERSION = process.env.MINI_APP_TESTING_VERSION || "";

type MiniJwtPayload = jwt.JwtPayload & {
  userId?: number;
  id?: number;
  type?: string;
  zaloUserId?: string | null;
};

const MINI_TOKEN_TYPES = new Set(["mini_app", "mini_app_web", "zalo_mini_app"]);

const miniUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  organizationId: true,
  departmentId: true,
  isDepartmentAccount: true,
  isFloorAccount: true,
  zaloUserId: true,
  zaloVerified: true,
} as const;

const assertMiniAppLaunchConfig = () => {
  if (!IS_PRODUCTION) return;
  if (!process.env.MINI_APP_WEB_URL || process.env.MINI_APP_WEB_URL.includes("localhost")) {
    throw new Error("MINI_APP_WEB_URL is required in production and must not use localhost");
  }
  if (!process.env.MINI_APP_LAUNCH_MODE) {
    throw new Error("MINI_APP_LAUNCH_MODE is required in production");
  }
  if (MINI_APP_LAUNCH_MODE === "zalo" && !process.env.ZALO_MINI_APP_ID) {
    throw new Error("ZALO_MINI_APP_ID is required in production when MINI_APP_LAUNCH_MODE=zalo");
  }
};

const resolveVerifiedZaloUser = async (accessTokenRaw: unknown) => {
  const accessToken = typeof accessTokenRaw === "string" ? accessTokenRaw.trim() : "";
  if (!accessToken) {
    throw new Error("MISSING_ZALO_ACCESS_TOKEN");
  }

  const profileRes = await axios.get("https://graph.zalo.me/v2.0/me?fields=id,name", {
    headers: {
      access_token: accessToken,
    },
  });

  if (profileRes.data?.error || !profileRes.data?.id) {
    throw new Error("INVALID_ZALO_ACCESS_TOKEN");
  }

  return {
    zaloUserId: String(profileRes.data.id).trim(),
    zaloUserName: typeof profileRes.data?.name === "string" ? profileRes.data.name.trim() : "",
  };
};

const buildMiniAppLaunchUrl = (
  queryValues: Record<string, string | undefined>
): { url: string; mode: "zalo" | "web" } => {
  const safeBase = MINI_APP_WEB_URL.replace(/\/+$/, "");
  const query = new URLSearchParams();
  const prefersZalo =
    MINI_APP_LAUNCH_MODE === "zalo" ||
    (MINI_APP_LAUNCH_MODE === "auto" && !!ZALO_MINI_APP_ID);

  Object.entries(queryValues).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) {
      query.set(key, value.trim());
    }
  });

  if (prefersZalo) {
    if (!ZALO_MINI_APP_ID) {
      throw new Error("ZALO_MINI_APP_ID is required when MINI_APP_LAUNCH_MODE=zalo");
    }
    const zaloParams = new URLSearchParams();
    zaloParams.set("env", "TESTING");
    if (MINI_APP_TESTING_VERSION.trim()) {
      zaloParams.set("version", MINI_APP_TESTING_VERSION.trim());
    }
    Object.entries(queryValues).forEach(([key, value]) => {
      if (typeof value === "string" && value.trim()) {
        zaloParams.set(key, value.trim());
      }
    });
    return {
      url: `https://zalo.me/s/${ZALO_MINI_APP_ID}/?${zaloParams.toString()}`,
      mode: "zalo",
    };
  }

  return {
    url: `${safeBase}/?${query.toString()}#/login`,
    mode: "web",
  };
};

export const miniAppAuthMiddleware = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as MiniJwtPayload;
    const tokenType = decoded.type;

    if (!tokenType || !MINI_TOKEN_TYPES.has(tokenType)) {
      return res.status(401).json({ error: "Invalid mini app token type" });
    }

    const userId = typeof decoded.userId === "number"
      ? decoded.userId
      : typeof decoded.id === "number"
      ? decoded.id
      : null;

    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: miniUserSelect,
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.miniUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

router.post("/auth/link-token", authMiddleware, async (req: any, res) => {
  try {
    assertMiniAppLaunchConfig();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Missing user id",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: miniUserSelect,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isDepartmentAccount) {
      return res.status(403).json({
        success: false,
        message: "Chi tai khoan department moi duoc lien ket Zalo",
      });
    }

    if (user.isFloorAccount) {
      return res.status(403).json({
        success: false,
        message: "Tai khoan floor account khong duoc lien ket Zalo mini app",
      });
    }

    const linkToken = jwt.sign(
      {
        userId: user.id,
        type: "mini_link_bind",
      },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    const launch = buildMiniAppLaunchUrl({
      linkToken,
      intent: "bind",
    });

    return res.json({
      success: true,
      message: "Link token created",
      data: {
        linkToken,
        expiresInSeconds: 600,
        launchUrl: launch.url,
        launchMode: launch.mode,
      },
    });
  } catch (error: any) {
    console.error("[MiniAppAuth] Create link token error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create link token",
      error: error.message,
    });
  }
});

router.post("/auth/link", async (req, res) => {
  try {
    const linkToken = req.body?.linkToken;
    const zaloUserNameRaw = req.body?.zaloUserName;

    if (typeof linkToken !== "string" || !linkToken.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing linkToken",
      });
    }

    const clientProvidedName = typeof zaloUserNameRaw === "string" ? zaloUserNameRaw.trim() : "";
    const { zaloUserId, zaloUserName } = await resolveVerifiedZaloUser(req.body?.zaloAccessToken);

    const decoded = jwt.verify(linkToken, JWT_SECRET) as MiniJwtPayload;

    if (decoded.type !== "mini_link_bind") {
      return res.status(401).json({
        success: false,
        message: "Invalid link token type",
      });
    }

    const userId = typeof decoded.userId === "number" ? decoded.userId : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid link payload",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: miniUserSelect,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isDepartmentAccount) {
      return res.status(403).json({
        success: false,
        message: "Chi tai khoan department moi duoc lien ket Zalo",
      });
    }

    if (user.isFloorAccount) {
      return res.status(403).json({
        success: false,
        message: "Tai khoan floor account khong duoc lien ket Zalo mini app",
      });
    }

    if (user.zaloUserId && user.zaloUserId !== zaloUserId) {
      return res.status(409).json({
        success: false,
        message: "Tai khoan nay da lien ket voi Zalo khac. Hay go lien ket cu truoc khi doi tai khoan.",
      });
    }

    if (user.zaloUserId && user.zaloUserId === zaloUserId && user.zaloVerified) {
      const token = jwt.sign(
        {
          userId: user.id,
          type: "mini_app_web",
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        message: "Tai khoan da lien ket Zalo tu truoc",
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            departmentId: user.departmentId,
            isDepartmentAccount: user.isDepartmentAccount,
            isFloorAccount: user.isFloorAccount,
            zaloUserId: user.zaloUserId,
            zaloVerified: user.zaloVerified,
          },
          zaloUser: {
            id: zaloUserId,
            name: zaloUserName || clientProvidedName || null,
          },
        },
      });
    }

    const existingLinkedUser = await prisma.user.findFirst({
      where: {
        zaloUserId,
        id: { not: user.id },
      },
      select: { id: true, name: true, email: true },
    });

    if (existingLinkedUser) {
      return res.status(409).json({
        success: false,
        message: `Zalo ID nay da lien ket voi tai khoan khac (${existingLinkedUser.email})`,
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        zaloUserId,
        zaloVerified: true,
        zaloLinkedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        departmentId: true,
        isDepartmentAccount: true,
        isFloorAccount: true,
        zaloUserId: true,
        zaloVerified: true,
        zaloLinkedAt: true,
      },
    });

    const token = jwt.sign(
      {
        userId: updated.id,
        type: "mini_app_web",
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Lien ket Zalo thanh cong",
      data: {
        token,
        user: updated,
        zaloUser: {
          id: zaloUserId,
          name: zaloUserName || clientProvidedName || null,
        },
      },
    });
  } catch (error: any) {
    console.error("[MiniAppAuth] Link account error:", error);
    if (error?.message === "MISSING_ZALO_ACCESS_TOKEN") {
      return res.status(400).json({
        success: false,
        message: "Missing zaloAccessToken",
      });
    }
    if (error?.message === "INVALID_ZALO_ACCESS_TOKEN") {
      return res.status(401).json({
        success: false,
        message: "Invalid Zalo access token",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired link token",
      error: error.message,
    });
  }
});

router.post("/auth/qr-login/approve", async (req, res) => {
  try {
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    const { zaloUserId } = await resolveVerifiedZaloUser(req.body?.zaloAccessToken);

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing sessionId",
      });
    }

    const session = await getQrLoginSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    if (session.status === "approved") {
      return res.json({
        success: true,
        message: "Session already approved",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        zaloUserId,
        zaloVerified: true,
      },
      include: {
        department: true,
        organization: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "NOT_LINKED",
        message: "Tai khoan Zalo chua lien ket voi tai khoan web",
      });
    }

    if (!user.isDepartmentAccount) {
      return res.status(403).json({
        success: false,
        message: "Chi tai khoan department moi duoc phe duyet dang nhap QR",
      });
    }

    if (user.isFloorAccount) {
      return res.status(403).json({
        success: false,
        message: "Tai khoan floor account khong duoc phe duyet dang nhap QR",
      });
    }

    await approveQrLoginSession(sessionId, {
      zaloUserId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department_id: user.departmentId,
        department_name: user.department?.name || null,
        organization_id: user.organizationId,
        organization_name: user.organization?.name || null,
        is_department_account: user.isDepartmentAccount,
        is_admin_view: user.isAdminView,
        is_floor_account: user.isFloorAccount,
      },
    });

    return res.json({
      success: true,
      message: "Da xac nhan dang nhap tren web",
      data: {
        sessionId,
        userId: user.id,
        userName: user.name,
      },
    });
  } catch (error: any) {
    console.error("[MiniAppAuth] QR approve error:", error);
    if (error?.message === "MISSING_ZALO_ACCESS_TOKEN") {
      return res.status(400).json({
        success: false,
        message: "Missing zaloAccessToken",
      });
    }
    if (error?.message === "INVALID_ZALO_ACCESS_TOKEN") {
      return res.status(401).json({
        success: false,
        message: "Invalid Zalo access token",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Khong the xac nhan dang nhap QR",
      error: error.message,
    });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { accessToken } = req.body;

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
    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

    const calls = await prisma.callLog.findMany({
      where: {
        toUser: user.name,
        ...(status !== "all" ? { status: status as string } : {}),
      },
      select: {
        id: true,
        callId: true,
        fromUser: true,
        toUser: true,
        message: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        rejectedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: safeLimit,
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

    if (pendingLogs.length === 0) {
      return;
    }

    await prisma.callLog.updateMany({
      where: {
        callId,
        status: "pending",
        toUser: { in: pendingLogs.map((log) => log.toUser) },
      },
      data: {
        status: "cancelled",
        rejectedAt: new Date(),
      },
    });

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
