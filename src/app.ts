import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import compression from "compression";
import http from "http";
import { networkInterfaces } from "os";
import { CallLogModel } from "./models/CallLog";
import { prisma } from "./models/db";

type CallLogRow = {
  id: number;
  callId: string;
  fromUser: string;
  toUser: string;
  message: string | null;
  imageUrl: string | null;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
};
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { onlineUsers, setIO, callTimers, normalizeName, findSocketByDepartmentName, emitCallLogUpdated } from "./socketStore";
import { getOrganizationIdForCall } from "./services/orgCache";

const SOCKET_JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
import callRoutes from "./routes/callRoutes";
import authRoutes from "./routes/authRoutes";
import departmentRoutes from "./routes/departmentRoutes";
import organizationRoutes from "./routes/organizationRoutes";
import historyRoutes from "./routes/historyRoutes";
import userRoutes from "./routes/userRoutes";
import statisticsRoutes from "./routes/statisticsRoutes";
import incidentCaseRoutes from "./routes/incidentCaseRoutes";
import miniAppRoutes from "./routes/miniAppRoutes";
const app = express();

app.use(compression());
app.use(express.json());

const STATIC_ALLOWED_ORIGINS = [
  "http://192.165.15.251",
  "http://192.165.15.251:5000",
  "http://192.165.70.251",
  "http://192.165.70.251:5000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "https://zalo.me",
  "https://mini.zalo.me",
  "https://id.zalo.me",
  "http://theanhne.one",
  "https://theanhne.one",
  "http://www.theanhne.one",
  "https://www.theanhne.one",
];

const isAllowedOrigin = (origin?: string | null) => {
  if (!origin) return true;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/192\.165\.\d+\.\d+(:\d+)?$/.test(origin)) return true;
  if (/^wss?:\/\/192\.165\.\d+\.\d+(:\d+)?$/.test(origin)) return true;

  let hostname = "";
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    hostname = String(origin).toLowerCase();
  }

  const hasAllowedSuffix =
    hostname.endsWith(".zalo.me") ||
    hostname.endsWith(".zalo.vn") ||
    hostname.endsWith(".zdn.vn") ||
    hostname.endsWith(".trycloudflare.com");

  if (
    hostname === "zalo.me" ||
    hostname === "zalo.vn" ||
    hostname === "zdn.vn" ||
    hostname === "trycloudflare.com" ||
    hasAllowedSuffix
  ) {
    return true;
  }

  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.warn("[CORS] Blocked origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.get("/api/health", cors({ origin: true }), (_req, res) => {
  res.status(200).json({ ok: true, service: "bluecode-api" });
});

app.options("/api/info", cors());
app.get("/api/info", cors({ origin: true }), (req, res) => {
  const origin = req.headers.origin || "";
  const hostname = req.headers.host?.split(":")[0] || "localhost";

  let apiUrl = `http://localhost:${PORT}`;

  if (origin.includes("192.165.")) {
    const match = origin.match(/http:\/\/(\d+\.\d+\.\d+\.\d+):/);
    if (match) {
      apiUrl = `http://${match[1]}:${PORT}`;
    } else {
      apiUrl = `http://${networkIP}:${PORT}`;
    }
  } else if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    apiUrl = `http://${hostname}:${PORT}`;
  }

  res.json({
    apiUrl,
    socketUrl: apiUrl,
    origin,
    hostname,
    message: "Use this apiUrl in your frontend config",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/call", callRoutes);
app.use("/api/incident-cases", incidentCaseRoutes);
app.use("/api/mini", miniAppRoutes);

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
);

const PORT = process.env.PORT || 5000;

const getNetworkIP = () => {
  const interfaces = networkInterfaces();
  let fallbackIPv4 = "";

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("192.165.")) {
          return iface.address;
        }
        if (!fallbackIPv4) fallbackIPv4 = iface.address;
      }
    }
  }

  return fallbackIPv4 || "127.0.0.1";
};

const networkIP = getNetworkIP();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      const isDevelopment = process.env.NODE_ENV !== "production";
      if (isDevelopment) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  path: "/socket.io/",
  pingTimeout: 60000,
  pingInterval: 25000,
});
setIO(io);

io.on("connection", (socket) => {
  type RegisteredSocketUser = {
    id: number;
    name: string;
    departmentName: string;
    organizationId: number | null;
    role: string;
  };

  const getRegisteredSocketUser = (): RegisteredSocketUser | null => {
    const value = (socket.data as { registeredUser?: RegisteredSocketUser }).registeredUser;
    return value && typeof value.id === "number" ? value : null;
  };

  const buildRecipientWhere = (user: RegisteredSocketUser) => {
    const targets = Array.from(
      new Set(
        [user.name, user.departmentName]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    return targets.map((target) => ({
      toUser: {
        equals: target,
        mode: "insensitive" as const,
      },
    }));
  };

  const canActAsSender = (user: RegisteredSocketUser, sender?: string | null) => {
    const normalizedSender = normalizeName(String(sender || ""));
    if (!normalizedSender) return false;
    return [user.name, user.departmentName]
      .map((value) => normalizeName(value))
      .some((value) => value === normalizedSender);
  };

  socket.on("register", async (data) => {
    const token = data?.token || socket.handshake.auth?.token;
    if (!token || typeof token !== "string") return;

    let verifiedUserId: number | null = null;
    try {
      const decoded = jwt.verify(token.trim(), SOCKET_JWT_SECRET) as any;
      verifiedUserId =
        typeof decoded.userId === "number" ? decoded.userId
        : typeof decoded.id === "number" ? decoded.id
        : null;
    } catch {
      return;
    }

    if (!verifiedUserId) return;

    const { UserModel } = await import("./models/User");
    const user = await UserModel.findById(verifiedUserId);
    if (!user) return;

    const safeName = (user.name || "").toString().trim();
    const safeDeptName = (user.department_name || safeName).toString().trim();
    const safeDeptId = String(user.department_id ?? "");
    const safeUserId = Number(user.id);

    if (!safeName || !Number.isInteger(safeUserId) || safeUserId <= 0) return;
    const key = `${safeName}_${safeDeptName || safeName}`;

    if (user.role === "SuperAdmin") {
      const orgs = await prisma.organization.findMany({ select: { id: true } });
      orgs.forEach((o: { id: number }) => socket.join(`organization_${o.id}`));
    } else if (user.organization_id) {
      const roomName = `organization_${user.organization_id}`;
      socket.join(roomName);
    }

    onlineUsers.set(key, {
      socketId: socket.id,
      name: safeName,
      department_id: safeDeptId,
      department_name: safeDeptName,
    });

    (socket.data as { registeredUser?: RegisteredSocketUser }).registeredUser = {
      id: safeUserId,
      name: safeName,
      departmentName: safeDeptName,
      organizationId: user.organization_id ?? null,
      role: String(user.role || ""),
    };
  });

  socket.on("callAccepted", async ({ callId }) => {
    try {
      const registeredUser = getRegisteredSocketUser();
      const safeCallId = String(callId || "").trim();
      if (!registeredUser?.organizationId || !safeCallId) return;

      const recipientWhere = buildRecipientWhere(registeredUser);
      if (recipientWhere.length === 0) return;

      const pendingLog = await prisma.callLog.findFirst({
        where: {
          callId: safeCallId,
          status: "pending",
          organizationId: registeredUser.organizationId,
          OR: recipientWhere,
        } as any,
        orderBy: { id: "asc" },
      });
      if (!pendingLog) return;

      const updatedLog = await CallLogModel.updateStatus(
        safeCallId,
        pendingLog.toUser,
        "accepted",
        undefined,
        registeredUser.organizationId
      );
      if (updatedLog) {
        const timer = callTimers.get(safeCallId);
        if (timer) {
          clearTimeout(timer);
          callTimers.delete(safeCallId);
        }

        const organizationId =
          registeredUser.organizationId ??
          (await getOrganizationIdForCall(updatedLog.from_user, updatedLog.to_user));

        const callLogData = {
          id: updatedLog.id,
          call_id: updatedLog.call_id,
          from_user: updatedLog.from_user,
          to_user: updatedLog.to_user,
          message: updatedLog.message,
          image_url: updatedLog.image_url,
          status: updatedLog.status,
          created_at: updatedLog.created_at,
          accepted_at: updatedLog.accepted_at,
          rejected_at: updatedLog.rejected_at,
        };

        if (organizationId) {
          const roomName = `organization_${organizationId}`;
          io.to(roomName).emit("callStatusUpdate", { 
            callId: safeCallId, 
            toDept: updatedLog.to_user,
            toUser: updatedLog.to_user,
            status: "accepted" 
          });
        } else {
          io.emit("callStatusUpdate", { 
            callId: safeCallId, 
            toDept: updatedLog.to_user,
            toUser: updatedLog.to_user,
            status: "accepted" 
          });
        }

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      }
    } catch (err) {
    }
  });

  socket.on("callRejected", async ({ callId }) => {
    try {
      const registeredUser = getRegisteredSocketUser();
      const safeCallId = String(callId || "").trim();
      if (!registeredUser?.organizationId || !safeCallId) return;

      const recipientWhere = buildRecipientWhere(registeredUser);
      if (recipientWhere.length === 0) return;

      const pendingLog = await prisma.callLog.findFirst({
        where: {
          callId: safeCallId,
          status: "pending",
          organizationId: registeredUser.organizationId,
          OR: recipientWhere,
        } as any,
        orderBy: { id: "asc" },
      });
      if (!pendingLog) return;

      const updatedLog = await CallLogModel.updateStatus(
        safeCallId,
        pendingLog.toUser,
        "rejected",
        undefined,
        registeredUser.organizationId
      );
      if (updatedLog) {
        const organizationId =
          registeredUser.organizationId ??
          (await getOrganizationIdForCall(updatedLog.from_user, updatedLog.to_user));

        const callLogData = {
          id: updatedLog.id,
          call_id: updatedLog.call_id,
          from_user: updatedLog.from_user,
          to_user: updatedLog.to_user,
          message: updatedLog.message,
          image_url: updatedLog.image_url,
          status: updatedLog.status,
          created_at: updatedLog.created_at,
          accepted_at: updatedLog.accepted_at,
          rejected_at: updatedLog.rejected_at,
        };

        const payload = {
          callId: safeCallId,
          toDept: updatedLog.to_user,
          toUser: updatedLog.to_user,
          status: "rejected" as const,
          fromUser: updatedLog.from_user,
        };

        const callerSocket = findSocketByDepartmentName(updatedLog.from_user);
        if (callerSocket) {
          callerSocket.emit("callStatusUpdate", payload);
        }

        if (organizationId) {
          const roomName = `organization_${organizationId}`;
          io.to(roomName).emit("callStatusUpdate", payload);
        } else {
          io.emit("callStatusUpdate", payload);
        }

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      }
    } catch (err) {
    }
  });

  socket.on("callTimeout", async ({ callId }) => {
    try {
      const registeredUser = getRegisteredSocketUser();
      const safeCallId = String(callId || "").trim();
      if (!registeredUser?.organizationId || !safeCallId) return;

      const recipientWhere = buildRecipientWhere(registeredUser);
      if (recipientWhere.length === 0) return;

      const pendingLogs = await prisma.callLog.findMany({
        where: {
          callId: safeCallId,
          status: "pending",
          organizationId: registeredUser.organizationId,
          OR: recipientWhere,
        } as any,
        select: { id: true },
      });
      if (pendingLogs.length === 0) return;

      const updated = await prisma.callLog.updateMany({
        where: {
          id: { in: pendingLogs.map((log) => log.id) },
          status: "pending",
        },
        data: { status: "timeout", rejectedAt: new Date() },
      });
      if (updated.count === 0) {
        return;
      }

      const updatedLogs = await prisma.callLog.findMany({
        where: {
          id: { in: pendingLogs.map((log) => log.id) },
          status: "timeout",
        },
      });
      const updatedLog = updatedLogs.length > 0 ? updatedLogs[0] : null;
      if (updatedLog) {
      const pendingRemain = await prisma.callLog.count({
          where: {
            callId: safeCallId,
            status: "pending",
            organizationId: registeredUser.organizationId,
          } as any,
        });

        if (pendingRemain === 0) {
          const timer = callTimers.get(safeCallId);
          if (timer) {
            clearTimeout(timer);
            callTimers.delete(safeCallId);
          }
        }

        const organizationId =
          registeredUser.organizationId ??
          (await getOrganizationIdForCall(updatedLog.fromUser, updatedLog.toUser));

        updatedLogs.forEach((log: CallLogRow) => {
          const callLogData = {
            id: log.id,
            call_id: log.callId,
            from_user: log.fromUser,
            to_user: log.toUser,
            message: log.message ?? undefined,
            image_url: log.imageUrl ?? undefined,
            status: log.status,
            created_at: log.createdAt,
            accepted_at: log.acceptedAt ?? undefined,
            rejected_at: log.rejectedAt ?? undefined,
          };
          if (organizationId) {
            io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
              callId: safeCallId,
              toDept: log.toUser,
              toUser: log.toUser,
              status: "timeout",
            });
          } else {
            io.emit("callStatusUpdate", {
              callId: safeCallId,
              toDept: log.toUser,
              toUser: log.toUser,
              status: "timeout",
            });
          }
          emitCallLogUpdated(callLogData, organizationId ?? undefined);
        });
      }
    } catch (err) {
    }
  });

  socket.on("cancelCall", async ({ callId }) => {
    try {
      const registeredUser = getRegisteredSocketUser();
      const safeCallId = String(callId || "").trim();
      if (!registeredUser?.organizationId || !safeCallId) return;

      const callLogs = await prisma.callLog.findMany({
        where: { callId: safeCallId, organizationId: registeredUser.organizationId } as any,
      });

      if (callLogs.length === 0) {
        socket.emit("error", { message: "Call not found" });
        return;
      }

      const firstCallLog = callLogs[0];

      if (!canActAsSender(registeredUser, firstCallLog.fromUser)) {
        socket.emit("error", { message: "Unauthorized: Only sender can cancel call" });
        return;
      }

      const pendingLogs = callLogs.filter((log: CallLogRow) => log.status === "pending");
      
      if (pendingLogs.length === 0) {
        return;
      }

      const timer = callTimers.get(safeCallId);
      if (timer) {
        clearTimeout(timer);
        callTimers.delete(safeCallId);
      }

      const updated = await prisma.callLog.updateMany({
        where: {
          callId: safeCallId,
          organizationId: registeredUser.organizationId,
          status: "pending",
        } as any,
        data: {
          status: "cancelled",
          rejectedAt: new Date(),
        },
      });

      if (updated.count > 0) {
        const updatedLogs = await prisma.callLog.findMany({
          where: { callId: safeCallId, organizationId: registeredUser.organizationId } as any,
        });
        const organizationId =
          registeredUser.organizationId ??
          (await getOrganizationIdForCall(firstCallLog.fromUser, firstCallLog.toUser));
        const targetNames = Array.from(new Set(updatedLogs.map((log: CallLogRow) => log.toUser)));

        targetNames.forEach((target: string) => {
          const targetSocket = findSocketByDepartmentName(target);
          if (targetSocket) {
            targetSocket.emit("callStatusUpdate", {
              callId: safeCallId,
              toDept: target,
              status: "cancelled",
            });
          }
        });

        if (organizationId) {
          const roomName = `organization_${organizationId}`;
          targetNames.forEach((target: string) => {
            io.to(roomName).emit("callStatusUpdate", {
              callId: safeCallId,
              toDept: target,
              status: "cancelled",
            });
          });
        } else {
          targetNames.forEach((target: string) => {
            io.emit("callStatusUpdate", {
              callId: safeCallId,
              toDept: target,
              status: "cancelled",
            });
          });
        }

        const emittedLogIds = new Set<number>();
        
        updatedLogs.forEach((log: CallLogRow) => {
          if (emittedLogIds.has(log.id)) {
            return;
          }
          emittedLogIds.add(log.id);

          const callLogData = {
            id: log.id,
            call_id: log.callId,
            from_user: log.fromUser,
            to_user: log.toUser,
            message: log.message || undefined,
            image_url: log.imageUrl || undefined,
            status: log.status,
            created_at: log.createdAt,
            accepted_at: log.acceptedAt || undefined,
            rejected_at: log.rejectedAt || undefined,
          };

          emitCallLogUpdated(callLogData, organizationId);
        });

      }
    } catch (error: any) {
      socket.emit("error", { message: "Failed to cancel call" });
    }
  });

  socket.on("disconnect", (reason) => {
    for (const [key, value] of onlineUsers.entries()) {
      if (value.socketId === socket.id) {
        onlineUsers.delete(key);
      }
    }
    delete (socket.data as { registeredUser?: RegisteredSocketUser }).registeredUser;
  });

  socket.on("error", (error) => {
  });
});

export { server, io };
export default app;
