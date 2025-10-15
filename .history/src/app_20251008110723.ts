import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server as SocketServer } from "socket.io";

import { setIO, onlineUsers } from "./socketStore";
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

// Khởi tạo Socket.IO
const io = new SocketServer(server, {
  cors: { origin: "http://localhost:3000" },
});
setIO(io);

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  socket.on("register", (phone: string) => {
    onlineUsers[phone] = socket.id;
    console.log(`📱 Registered: ${phone}`);
  });

  socket.on("disconnect", () => {
    for (const phone in onlineUsers) {
      if (onlineUsers[phone] === socket.id) delete onlineUsers[phone];
    }
    console.log("❌ Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 REST API + Socket.IO running on http://localhost:${PORT}`);
});

export default app;
