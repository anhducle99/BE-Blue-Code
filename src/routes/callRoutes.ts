import { Router } from "express";
import { CallLogModel } from "../models/CallLog.js";
import { getIO, onlineUsers } from "../socketStore.js";
import { randomUUID } from "crypto";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { targetKeys, message, fromDept, image_url } = req.body;
    const io = getIO();
    const callId = randomUUID();

    for (const key of targetKeys) {
      const targetUser = onlineUsers.get(key);

      await CallLogModel.create({
        call_id: callId,
        from_user: fromDept,
        to_user: key.split("_")[0],
        message: message || undefined,
        image_url: image_url || undefined,
        status: "pending",
      });

      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          fromDept,
          toDept: targetUser.department_name,
          message,
          image_url,
        });
      } else {
        console.log(`${key} not online`);
      }
    }

    res.json({ success: true, callId });
  } catch (err) {
    console.error("Error in POST /api/call:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { department } = req.query;
    const logs = await CallLogModel.findByDepartment(department as string);
    res.json({ success: true, data: logs });
  } catch (err) {
    console.error("Error in GET /api/call:", err);
    res.status(500).json({ success: false });
  }
});

export default router;
