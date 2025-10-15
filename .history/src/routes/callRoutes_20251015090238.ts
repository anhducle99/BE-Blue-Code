import { Router } from "express";
import { getIO, onlineUsers } from "../socketStore";

const router = Router();

router.post("/", (req, res) => {
  try {
    const { targetPhones, message, fromDept } = req.body;
    const io = getIO();
    const callId = Date.now().toString();

    console.log("📤 /api/call request:", { fromDept, targetPhones, message });

    targetPhones.forEach((targetKey: any) => {
      const key = String(targetKey);
      const targetUser = onlineUsers.get(key); // ✅ dùng Map.get()

      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          message,
          fromDept,
          toDept: targetUser.department_name,
          toName: targetUser.name,
        });
        console.log(
          `   ✅ emitted incomingCall to ${targetUser.department_name} (${targetUser.name}) via ${targetUser.socketId}`
        );
      } else {
        console.warn("   ⚠️ target not online:", key);
      }
    });

    res.json({ success: true, callId });
  } catch (err) {
    console.error("❌ Error in /api/call:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
