import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { networkInterfaces } from "os";
import { CallLogModel } from "./models/CallLog";
import { Server as SocketServer } from "socket.io";
import { onlineUsers, setIO } from "./socketStore";
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
    console.error(err);
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
  socket.on("register", (data) => {
    const { name, department_id, department_name } = data;
    const key = `${department_name}_${department_name}`;
    onlineUsers.set(key, {
      socketId: socket.id,
      name: data.name,
      department_id: data.department_id,
      department_name: data.department_name,
    });
  });

  socket.on("callAccepted", async ({ callId, toDept }) => {
    try {
      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "accepted");
      if (updatedLog) {
        io.emit("callLogUpdated", {
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
        });
        io.emit("callStatusUpdate", { callId, toDept, status: "accepted" });
      }
    } catch (err) {
      console.error("callAccepted error:", err);
    }
  });

  socket.on("callRejected", async ({ callId, toDept }) => {
    try {
      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "rejected");
      if (updatedLog) {
        io.emit("callLogUpdated", {
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
        });
        io.emit("callStatusUpdate", { callId, toDept, status: "rejected" });
      }
    } catch (err) {
      console.error("callRejected error:", err);
    }
  });

  socket.on("callTimeout", async ({ callId, toDept }) => {
    try {
      const updatedLog = await CallLogModel.updateStatus(callId, toDept, "unreachable");
      if (updatedLog) {
        io.emit("callLogUpdated", {
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
        });
        io.emit("callStatusUpdate", { callId, toDept, status: "unreachable" });
      }
    } catch (err) {
      console.error("callTimeout error:", err);
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
    console.error(`Socket.IO error for ${socket.id}:`, error);
  });
});

export { server, io };
export default app;
