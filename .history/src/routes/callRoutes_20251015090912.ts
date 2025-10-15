import { Router } from "express";
import { getIO, onlineUsers } from "../socketStore";

const router = Router();

router.post("/", (req, res) => {
  try {
    const { targetKeys, message, fromDept } = req.body;
    const io = getIO();
    const callId = Date.now().toString();

    console.log("📤 /api/call request:", { fromDept, targetKeys, message });

    targetKeys.forEach((key: string) => {
      const targetUser = onlineUsers.get(key);

      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          message,
          fromDept,
          toDept: targetUser.department_name,
          toName: targetUser.name,
        });
        console.log(`   ✅ emitted incomingCall to ${key}`);
      } else {
        console.warn("   ⚠️ target not online:", key);
      }
    });

    res.json({ success: true, callId });
  } catch (err) {
    console.error("❌ Error in /api/call:", err);
    res.status(500).json({ success: false });
  }
});

export default router;
