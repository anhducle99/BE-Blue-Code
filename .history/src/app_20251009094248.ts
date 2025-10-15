import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server as SocketServer } from "socket.io";

import { setIO, onlineUsers } from "./socketStore"; // ✅ sử dụng store chung, không khai báo lại
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
const server = http.createServer(app);

// ⚡ Khởi tạo Socket.IO
const io = new SocketServer(server, {
  cors: { origin: "http://localhost:3000" },
});
setIO(io);

io.on("connection", (socket) => {
  console.log("🔌 New socket connection:", socket.id);

  // Khi client đăng ký (FE sẽ gửi name, department_id hoặc phone)
  socket.on("register", (data) => {
    console.log("📱 Register:", data, "from", socket.id);

    // data có thể là { name, department_id }
    const key = data?.department_id || data?.name || String(data);
    if (key) {
      onlineUsers[key] = {
        socketId: socket.id,
        name: data?.name,
        department_id: data?.department_id,
      };
    }

    console.log("📍 onlineUsers now:", onlineUsers);
  });

  // Khi ngắt kết nối
  socket.on("disconnect", () => {
    console.log("❌ socket disconnected:", socket.id);
    for (const key in onlineUsers) {
      if (onlineUsers[key].socketId === socket.id) {
        delete onlineUsers[key];
        console.log("🗑 Removed:", key);
      }
    }
    console.log("📍 onlineUsers now:", onlineUsers);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 REST API + Socket.IO running on http://localhost:${PORT}`);
});

export default app;
