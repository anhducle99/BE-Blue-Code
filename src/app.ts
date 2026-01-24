import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { networkInterfaces } from "os";
import { CallLogModel } from "./models/CallLog";
import { Server as SocketServer } from "socket.io";
import { onlineUsers, setIO, callTimers, normalizeName, findSocketByDepartmentName, emitCallLogUpdated } from "./socketStore";
import callRoutes from "./routes/callRoutes";
import authRoutes from "./routes/authRoutes";
import departmentRoutes from "./routes/departmentRoutes";
import organizationRoutes from "./routes/organizationRoutes";
import historyRoutes from "./routes/historyRoutes";
import userRoutes from "./routes/userRoutes";
import statisticsRoutes from "./routes/statisticsRoutes";
const app = express();

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://192.165.15.251",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

app.options("/api/info", cors());
app.get("/api/info", cors({ origin: true }), (req, res) => {
  const origin = req.headers.origin || "";
  const hostname = req.headers.host?.split(":")[0] || "localhost";

  let apiUrl = `http://localhost:${PORT}`;

  if (origin.includes("192.165.15.")) {
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
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("192.165.15.")) {
          return iface.address;
        }
      }
    }
  }
  return "192.165.15.28";
};

const networkIP = getNetworkIP();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }

      if (/^http:\/\/192\.165\.15\.\d+(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      if (/^ws:\/\/192\.165\.15\.\d+(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      const isDevelopment = process.env.NODE_ENV !== "production";
      if (isDevelopment) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
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
  socket.on("register", async (data) => {
    const { name, department_id, department_name } = data;
    const key = `${department_name}_${department_name}`;
    const { UserModel } = await import("./models/User");

    let user = await UserModel.findByEmail(name);
    if (!user) {
      const allUsers = await UserModel.findAll();
      user = allUsers.find(u => u.name === name || u.email === name) || null;
    }

    if (user && user.organization_id) {
      const roomName = `organization_${user.organization_id}`;
      socket.join(roomName);
    } else {
    }

    onlineUsers.set(key, {
      socketId: socket.id,
      name: data.name,
      department_id: data.department_id,
      department_name: data.department_name,
    });
  });

  socket.on("callAccepted", async ({ callId, toDept }) => {
    try {
      const timer = callTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        callTimers.delete(callId);
      }

      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "accepted");
      if (updatedLog) {
        const { UserModel } = await import("./models/User");
        const { prisma } = await import("./models/db");

        let senderUser = null;
        const fromUserId = parseInt(updatedLog.from_user);
        if (!isNaN(fromUserId)) {
          senderUser = await UserModel.findById(fromUserId);
        }
        if (!senderUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.from_user },
            select: { organizationId: true }
          });
          if (userByName) senderUser = { organization_id: userByName.organizationId };
        }

        let receiverUser = null;
        const toUserId = parseInt(updatedLog.to_user);
        if (!isNaN(toUserId)) {
          receiverUser = await UserModel.findById(toUserId);
        }
        if (!receiverUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.to_user },
            select: { organizationId: true }
          });
          if (userByName) receiverUser = { organization_id: userByName.organizationId };
        }

        const organizationId = senderUser?.organization_id || receiverUser?.organization_id;

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
          io.to(roomName).emit("callStatusUpdate", { callId, toDept, status: "accepted" });
        } else {
          io.emit("callStatusUpdate", { callId, toDept, status: "accepted" });
        }

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      }
    } catch (err) {
    }
  });

  socket.on("callRejected", async ({ callId, toDept }) => {
    try {
      const timer = callTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        callTimers.delete(callId);
      }

      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "rejected");
      if (updatedLog) {
        const { UserModel } = await import("./models/User");
        const { prisma } = await import("./models/db");

        let senderUser = null;
        const fromUserId = parseInt(updatedLog.from_user);
        if (!isNaN(fromUserId)) {
          senderUser = await UserModel.findById(fromUserId);
        }
        if (!senderUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.from_user },
            select: { organizationId: true }
          });
          if (userByName) senderUser = { organization_id: userByName.organizationId };
        }

        let receiverUser = null;
        const toUserId = parseInt(updatedLog.to_user);
        if (!isNaN(toUserId)) {
          receiverUser = await UserModel.findById(toUserId);
        }
        if (!receiverUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.to_user },
            select: { organizationId: true }
          });
          if (userByName) receiverUser = { organization_id: userByName.organizationId };
        }

        const organizationId = senderUser?.organization_id || receiverUser?.organization_id;

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
          io.to(roomName).emit("callStatusUpdate", { callId, toDept, status: "rejected" });
        } else {
          io.emit("callStatusUpdate", { callId, toDept, status: "rejected" });
        }

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      }
    } catch (err) {
    }
  });

  socket.on("callTimeout", async ({ callId, toDept }) => {
    try {
      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "timeout");
      if (updatedLog) {
        const timer = callTimers.get(callId);
        if (timer) {
          clearTimeout(timer);
          callTimers.delete(callId);
        }

        const { UserModel } = await import("./models/User");
        const { prisma } = await import("./models/db");

        let senderUser = null;
        const fromUserId = parseInt(updatedLog.from_user);
        if (!isNaN(fromUserId)) {
          senderUser = await UserModel.findById(fromUserId);
        }
        if (!senderUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.from_user },
            select: { organizationId: true }
          });
          if (userByName) senderUser = { organization_id: userByName.organizationId };
        }

        let receiverUser = null;
        const toUserId = parseInt(updatedLog.to_user);
        if (!isNaN(toUserId)) {
          receiverUser = await UserModel.findById(toUserId);
        }
        if (!receiverUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: updatedLog.to_user },
            select: { organizationId: true }
          });
          if (userByName) receiverUser = { organization_id: userByName.organizationId };
        }

        const organizationId = senderUser?.organization_id || receiverUser?.organization_id;

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
          io.to(roomName).emit("callStatusUpdate", { callId, toDept, status: "timeout" });
        } else {
          io.emit("callStatusUpdate", { callId, toDept, status: "timeout" });
        }

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      }
    } catch (err) {
    }
  });

  socket.on("cancelCall", async ({ callId, from, targets }) => {
    try {
      const { prisma } = await import("./models/db");
      const callLogs = await prisma.callLog.findMany({
        where: { callId },
      });

      if (callLogs.length === 0) {
        console.warn(`Call ${callId} not found`);
        socket.emit("error", { message: "Call not found" });
        return;
      }

      const firstCallLog = callLogs[0];

      const normalizedFrom = normalizeName(from);
      const normalizedSender = normalizeName(firstCallLog.fromUser);
      
      if (normalizedFrom !== normalizedSender && firstCallLog.fromUser !== from) {
        socket.emit("error", { message: "Unauthorized: Only sender can cancel call" });
        return;
      }

      const pendingLogs = callLogs.filter(log => log.status === "pending");
      
      if (pendingLogs.length === 0) {
        return;
      }

      const timer = callTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        callTimers.delete(callId);
      }

      const updated = await prisma.callLog.updateMany({
        where: {
          callId,
          status: "pending",
        },
        data: {
          status: "cancelled",
          rejectedAt: new Date(),
        },
      });

      if (updated.count > 0) {
        const updatedLogs = await prisma.callLog.findMany({
          where: { callId },
        });
        const { UserModel } = await import("./models/User");

        let senderUser = null;
        const fromUserId = parseInt(firstCallLog.fromUser);
        if (!isNaN(fromUserId)) {
          senderUser = await UserModel.findById(fromUserId);
        }
        if (!senderUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: firstCallLog.fromUser },
            select: { organizationId: true }
          });
          if (userByName) senderUser = { organization_id: userByName.organizationId };
        }

        let receiverUser = null;
        const toUserId = parseInt(firstCallLog.toUser);
        if (!isNaN(toUserId)) {
          receiverUser = await UserModel.findById(toUserId);
        }
        if (!receiverUser) {
          const userByName = await prisma.user.findFirst({
            where: { name: firstCallLog.toUser },
            select: { organizationId: true }
          });
          if (userByName) receiverUser = { organization_id: userByName.organizationId };
        }

        const organizationId = senderUser?.organization_id || receiverUser?.organization_id;

        const targetNames = targets && Array.isArray(targets) 
          ? targets 
          : updatedLogs.map(log => log.toUser);

        targetNames.forEach((target: string) => {
          const targetSocket = findSocketByDepartmentName(target);
          if (targetSocket) {
            targetSocket.emit("callStatusUpdate", {
              callId,
              toDept: target,
              status: "cancelled",
            });
          }
        });

        if (organizationId) {
          const roomName = `organization_${organizationId}`;
          targetNames.forEach((target: string) => {
            io.to(roomName).emit("callStatusUpdate", {
              callId,
              toDept: target,
              status: "cancelled",
            });
          });
        } else {
          targetNames.forEach((target: string) => {
            io.emit("callStatusUpdate", {
              callId,
              toDept: target,
              status: "cancelled",
            });
          });
        }

        const emittedLogIds = new Set<number>();
        
        updatedLogs.forEach((log) => {
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
  });

  socket.on("error", (error) => {
  });
});

export { server, io };
export default app;
