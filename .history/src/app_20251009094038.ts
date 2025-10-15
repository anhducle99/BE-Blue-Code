import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { randomUUID } from "crypto";

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

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] },
});

interface OnlineUser {
  socketId: string;
  name: string;
  department_id: string;
  department_name: string;
}

const onlineUsers: Record<string, OnlineUser> = {};

// 🧠 Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);

  socket.on(
    "register",
    (
      identifier:
        | string
        | { name: string; department_id: string; department_name?: string }
    ) => {
      let key = "";
      let info: OnlineUser;

      if (typeof identifier === "string") {
        key = identifier;
        info = {
          socketId: socket.id,
          name: identifier,
          department_id: identifier,
          department_name: "Không rõ",
        };
      } else {
        key = identifier.department_id || identifier.name;
        info = {
          socketId: socket.id,
          name: identifier.name,
          department_id: identifier.department_id,
          department_name: identifier.department_name || "Không rõ",
        };
      }

      onlineUsers[key] = info;
      console.log("✅ Registered:", info);
      console.log("📍 Online users:", onlineUsers);
    }
  );

  socket.on("disconnect", () => {
    for (const key in onlineUsers) {
      if (onlineUsers[key].socketId === socket.id) {
        console.log("❌ Disconnected:", key);
        delete onlineUsers[key];
      }
    }
    console.log("📍 Online users:", onlineUsers);
  });
});

// 📞 API gọi đến các khoa
app.post("/api/call", async (req, res) => {
  try {
    const { fromDept, fromPhone, message, targetPhones } = req.body;

    console.log("📤 /api/call request:", req.body);

    const callId = randomUUID();

    for (const target of targetPhones) {
      const targetUser = Object.values(onlineUsers).find(
        (u) => u.department_id === target || u.name === target
      );

      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          message,
          fromDept,
        });
        console.log(
          `📩 Sent incomingCall to ${targetUser.department_name} (${targetUser.name})`
        );
      } else {
        console.log(`⚠️ Target not online: ${target}`);
      }
    }

    res.json({ success: true, callId });
  } catch (err) {
    console.error("❌ /api/call error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 REST API + Socket.IO running on http://localhost:${PORT}`);
});

export default app;
