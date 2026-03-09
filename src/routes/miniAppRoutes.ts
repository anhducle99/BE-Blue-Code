import { Router } from "express";
import { Prisma } from "@prisma/client";
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
const CALL_PENDING_TIMEOUT_MS = Number(process.env.CALL_PENDING_TIMEOUT_MS || "17000");
const MINI_PENDING_GRACE_MS = Number(process.env.MINI_PENDING_GRACE_MS || "3000");
const MINI_PENDING_MAX_AGE_MS = Math.max(5000, CALL_PENDING_TIMEOUT_MS + MINI_PENDING_GRACE_MS);

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
  zaloDisplayName: true,
  zaloVerified: true,
} as const;

const normalizeIdentityName = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();

const collectMiniCallTargets = (userName?: string | null, departmentName?: string | null): string[] => {
  const rawTargets = [userName, departmentName]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => !!v);

  const normalizedTargets = rawTargets.map((v) => normalizeIdentityName(v)).filter((v) => !!v);
  return Array.from(new Set([...rawTargets, ...normalizedTargets]));
};

const buildToUserWhere = (targets: string[]) =>
  targets
    .filter((v) => !!v)
    .map((target) => ({
      toUser: {
        equals: target,
        mode: "insensitive" as const,
      },
    }));

const getPendingFreshAfter = () => new Date(Date.now() - MINI_PENDING_MAX_AGE_MS);

const buildOrgFilter = (organizationId?: number | null) =>
  typeof organizationId === "number" ? { organizationId } : { organizationId: -1 };

const expireStalePendingMiniCalls = async (callTargets: string[], organizationId?: number | null) => {
  const toUserWhere = buildToUserWhere(callTargets);
  if (toUserWhere.length === 0) return 0;

  const staleWhere = {
    status: "pending" as const,
    OR: toUserWhere,
    createdAt: { lt: getPendingFreshAfter() },
    ...buildOrgFilter(organizationId),
  };

  const result = await prisma.callLog.updateMany({
    where: staleWhere,
    data: {
      status: "timeout",
      rejectedAt: new Date(),
    },
  });

  return result.count;
};

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
    url: `${safeBase}/login?${query.toString()}`,
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

    if (!user.isDepartmentAccount) {
      return res.status(403).json({ error: "Mini app chi ho tro tai khoan department" });
    }

    if (user.isFloorAccount) {
      return res.status(403).json({ error: "Tai khoan floor account khong duoc phep truy cap mini app" });
    }

    if (typeof user.organizationId !== "number") {
      return res.status(403).json({ error: "Tai khoan chua thuoc organization nao" });
    }

    let departmentName: string | null = null;
    if (user.departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: user.departmentId },
        select: { name: true },
      });
      departmentName = department?.name || null;
    }

    req.miniUser = {
      ...user,
      departmentName: departmentName || undefined,
    };
    req.miniCallTargets = collectMiniCallTargets(user.name, departmentName);
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
            zaloDisplayName:
              user.zaloDisplayName || zaloUserName || clientProvidedName || null,
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
        zaloDisplayName: zaloUserName || clientProvidedName || null,
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
        zaloDisplayName: true,
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

    if (typeof user.organizationId !== "number") {
      return res.status(403).json({
        success: false,
        message: "Tai khoan chua thuoc organization nao",
      });
    }

    if (typeof session.expectedUserId === "number" && session.expectedUserId !== user.id) {
      return res.status(403).json({
        success: false,
        code: "QR_BOUND_TO_OTHER_ACCOUNT",
        message:
          "Tai khoan Zalo nay da lien ket voi tai khoan web khac. QR nay duoc tao cho tai khoan khac, khong the dang nhap.",
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
        isDepartmentAccount: true,
        isFloorAccount: true,
        zaloUserId: true,
        zaloDisplayName: true,
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

    if (!user.isDepartmentAccount) {
      return res.status(403).json({
        success: false,
        message: "Chi tai khoan department moi duoc dang nhap mini app",
      });
    }

    if (user.isFloorAccount) {
      return res.status(403).json({
        success: false,
        message: "Tai khoan floor account khong duoc dang nhap mini app",
      });
    }

    if (typeof user.organizationId !== "number") {
      return res.status(403).json({
        success: false,
        message: "Tai khoan chua thuoc organization nao",
      });
    }

    const profileDisplayName =
      typeof zaloUserInfo?.name === "string" ? zaloUserInfo.name.trim() : "";
    const finalDisplayName = profileDisplayName || user.zaloDisplayName || null;
    if (finalDisplayName && finalDisplayName !== user.zaloDisplayName) {
      await prisma.user.update({
        where: { id: user.id },
        data: { zaloDisplayName: finalDisplayName },
      });
      user.zaloDisplayName = finalDisplayName;
    }

    let departmentName: string | null = null;
    if (user.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: user.departmentId },
        select: { name: true },
      });
      departmentName = dept?.name || null;
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
          departmentName: departmentName || undefined,
          zaloDisplayName: user.zaloDisplayName,
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
    const { status = "pending", limit = "50" } = req.query;
    const callTargets = Array.isArray(req.miniCallTargets) ? req.miniCallTargets : collectMiniCallTargets(user?.name);
    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
    const shouldExpirePending = status === "pending" || status === "all" || status === "timeout";

    if (shouldExpirePending) {
      await expireStalePendingMiniCalls(callTargets, user.organizationId);
    }

    const pendingFilter =
      status === "pending"
        ? { createdAt: { gte: getPendingFreshAfter() } }
        : {};

    const calls = await prisma.callLog.findMany({
      where: {
        OR: buildToUserWhere(callTargets),
        ...(status !== "all" ? { status: status as string } : {}),
        ...pendingFilter,
        ...buildOrgFilter(user.organizationId),
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
    const callTargets = Array.isArray(req.miniCallTargets) ? req.miniCallTargets : collectMiniCallTargets(user?.name);

    const call = await prisma.callLog.findFirst({
      where: {
        callId,
        OR: buildToUserWhere(callTargets),
        ...buildOrgFilter(user.organizationId),
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
    const callTargets = Array.isArray(req.miniCallTargets) ? req.miniCallTargets : collectMiniCallTargets(user?.name);

    await expireStalePendingMiniCalls(callTargets, user.organizationId);

    const callLog = await prisma.callLog.findFirst({
      where: {
        callId,
        OR: buildToUserWhere(callTargets),
        status: "pending",
        createdAt: { gte: getPendingFreshAfter() },
        ...buildOrgFilter(user.organizationId),
      },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Cuộc gọi không tồn tại hoặc đã được xử lý",
      });
    }

    const ACCEPT_MAX_RETRIES = 3;
    let acceptedLog: any = null;
    let cancelledToUsers: string[] = [];

    for (let attempt = 0; attempt < ACCEPT_MAX_RETRIES; attempt++) {
      try {
        const txResult = await prisma.$transaction(async (tx) => {
          const alreadyAccepted = await tx.callLog.findFirst({
            where: {
              callId,
              status: "accepted",
              ...buildOrgFilter(user.organizationId),
            },
          });
          if (alreadyAccepted) return null;

          const accepted = await tx.callLog.updateMany({
            where: {
              callId,
              toUser: callLog.toUser,
              status: "pending",
              ...buildOrgFilter(user.organizationId),
            },
            data: { status: "accepted", acceptedAt: new Date() },
          });
          if (accepted.count === 0) return null;

          const otherPending = await tx.callLog.findMany({
            where: {
              callId,
              status: "pending",
              toUser: { not: callLog.toUser },
              ...buildOrgFilter(user.organizationId),
            },
            select: { toUser: true },
          });

          if (otherPending.length > 0) {
            await tx.callLog.updateMany({
              where: {
                callId,
                status: "pending",
                ...buildOrgFilter(user.organizationId),
              },
              data: { status: "cancelled", rejectedAt: new Date() },
            });
          }

          const freshLog = await tx.callLog.findFirst({
            where: {
              callId,
              toUser: callLog.toUser,
              ...buildOrgFilter(user.organizationId),
            },
          });

          return {
            accepted: freshLog,
            cancelledToUsers: otherPending.map((l) => l.toUser),
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        if (!txResult) {
          return res.status(400).json({
            success: false,
            message: "Không thể cập nhật trạng thái. Có thể cuộc gọi đã được xử lý.",
          });
        }

        acceptedLog = txResult.accepted;
        cancelledToUsers = txResult.cancelledToUsers;
        break;
      } catch (e: any) {
        if (e.code === "P2034" && attempt < ACCEPT_MAX_RETRIES - 1) continue;
        throw e;
      }
    }

    if (!acceptedLog) {
      return res.status(400).json({
        success: false,
        message: "Không thể cập nhật trạng thái. Có thể cuộc gọi đã được xử lý.",
      });
    }

    const io = getIO();
    if (io && user.organizationId) {
      const room = `organization_${user.organizationId}`;

      io.to(room).emit("callStatusUpdate", {
        callId,
        toDept: callLog.toUser,
        toUser: callLog.toUser,
        status: "accepted",
      });

      emitCallLogUpdated(
        {
          id: acceptedLog.id,
          call_id: acceptedLog.callId,
          from_user: acceptedLog.fromUser,
          to_user: acceptedLog.toUser,
          message: acceptedLog.message,
          image_url: acceptedLog.imageUrl,
          status: acceptedLog.status,
          created_at: acceptedLog.createdAt,
          accepted_at: acceptedLog.acceptedAt,
          rejected_at: acceptedLog.rejectedAt,
        },
        user.organizationId
      );

      cancelledToUsers.forEach((toUser) => {
        io.to(room).emit("callStatusUpdate", {
          callId,
          toDept: toUser,
          toUser,
          status: "cancelled",
        });
      });
    }

    res.json({
      success: true,
      message: "Đã nhận cuộc gọi thành công",
      data: {
        callId,
        status: "accepted",
        acceptedAt: acceptedLog.acceptedAt,
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
    const callTargets = Array.isArray(req.miniCallTargets) ? req.miniCallTargets : collectMiniCallTargets(user?.name);

    await expireStalePendingMiniCalls(callTargets, user.organizationId);

    const callLog = await prisma.callLog.findFirst({
      where: {
        callId,
        OR: buildToUserWhere(callTargets),
        status: "pending",
        createdAt: { gte: getPendingFreshAfter() },
        ...buildOrgFilter(user.organizationId),
      },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Cuộc gọi không tồn tại hoặc đã được xử lý",
      });
    }

    const updated = await CallLogModel.updateStatus(
      callId,
      callLog.toUser,
      "rejected",
      undefined,
      user.organizationId
    );

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
        toDept: callLog.toUser,
        toUser: callLog.toUser,
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


export default router;
