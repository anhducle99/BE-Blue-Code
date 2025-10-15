import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server as SocketServer } from "socket.io";

import {
  setIO,
  registerOnlineUser,
  removeOnlineUser,
  debugOnlineUsers,
} from "./socketStore";

import callRoutes from "./routes/callRoutes";
import authRoutes from "./routes/authRoutes";
import departmentRoutes from "./routes/departmentRoutes";
import organizationRoutes from "./routes/organizationRoutes";
import historyRoutes from "./routes/historyRoutes";
import userRoutes from "./routes/userRoutes";
import statisticsRoutes from "./routes/statisticsRoutes";

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/call", callRoutes);

// ✅ Error Handler
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

// ✅ Khởi tạo server
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// ⚡ Socket.IO setup
const io = new SocketServer(server, {
  cors: { origin: "http://localhost:3000", credentials: true },
});
setIO(io);

// 🔌 Socket.IO Logic
io.on("connection", (socket) => {
  console.log("✅ New socket connection:", socket.id);

  socket.on("register", (data) => {
    const { name, department_id, department_name } = data;
    const key = `${name}_${department_name}`;

    onlineUsers.set(key, {
      socketId: socket.id,
      name,
      department_id,
      department_name,
    });

    console.log("📱 register event:", data);
    console.log(
      "📍 Online users:",
      Array.from(onlineUsers, ([key, value]) => ({
        key,
        socketId: value.socketId,
        name: value.name,
        dept: value.department_name,
      }))
    );
  });
server.listen(PORT, () => {
  console.log(`🚀 REST API + Socket.IO running on http://localhost:${PORT}`);
});

export default app;
