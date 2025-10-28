import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { onlineUsers, setIO } from "./socketStore";
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

const io = new SocketServer(server, {
  cors: { origin: "http://localhost:3000", credentials: true },
});
setIO(io);

io.on("connection", (socket) => {
  socket.on("register", (data) => {
    const { name, department_id, department_name } = data;
    const key = `${data.department_name}_${data.department_name}`;

    onlineUsers.set(key, {
      socketId: socket.id,
      name,
      department_id,
      department_name,
    });
  });

  socket.on("startCall", ({ callId, from, targets }) => {
    targets.forEach((target: string) => {
      const user = onlineUsers.get(`${target}_${target}`);
      if (user) {
        io.to(user.socketId).emit("incomingCall", {
          callId,
          from,
        });
        console.log(`Gửi tín hiệu đến ${target}`);
      } else {
        console.log(`Không tìm thấy socket cho ${target}`);
      }
    });
  });

  socket.on("callAccepted", ({ callId, from }) => {
    console.log(`✅ ${from} đã xác nhận cuộc gọi ${callId}`);
    io.emit("callAccepted", { callId, from });
  });

  socket.on("disconnect", () => {
    for (const [key, value] of onlineUsers.entries()) {
      if (value.socketId === socket.id) {
        onlineUsers.delete(key);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`REST API + Socket.IO running on http://localhost:${PORT}`);
});

export default app;
