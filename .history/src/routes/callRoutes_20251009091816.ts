import { Router, Request, Response } from "express";
import { getIO, onlineUsers } from "../socketStore";

const router = Router();

// callRoutes.ts (debug)
router.post("/", (req, res) => {
  const { targetPhones, message, fromDept } = req.body;
  const io = getIO();
  const callId = Date.now().toString();

  console.log("📤 /api/call request:", { fromDept, targetPhones, message });

  targetPhones.forEach((phoneRaw: any) => {
    const phone = String(phoneRaw);
    const socketId = onlineUsers[phone];
    console.log("   => target:", phone, "socketId:", socketId);
    if (socketId) {
      io.to(socketId).emit("incomingCall", { callId, message, fromDept });
      console.log("   ✅ emitted incomingCall to", phone, "via", socketId);
    } else {
      console.warn("   ⚠️ target not online:", phone);
    }
  });

  res.json({ success: true, callId });
});

export default router;
