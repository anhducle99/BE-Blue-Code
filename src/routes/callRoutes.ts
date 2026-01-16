import { Router } from "express";
import { CallLogModel } from "../models/CallLog";
import { getIO, onlineUsers } from "../socketStore";
import { randomUUID } from "crypto";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { targetKeys, message, fromDept, image_url } = req.body;
    const io = getIO();
    if (!io) {
      return res.status(500).json({ success: false, message: "Socket.IO not initialized" });
    }

    const callId = randomUUID();
    const createdLogs: any[] = [];

    for (const key of targetKeys) {
      const targetUser = onlineUsers.get(key);

      const callLog = await CallLogModel.create({
        call_id: callId,
        from_user: fromDept,
        to_user: key.split("_")[0],
        message: message || undefined,
        image_url: image_url || undefined,
        status: "pending",
      });

      createdLogs.push(callLog);

      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          fromDept,
          toDept: targetUser.department_name,
          message,
          image_url,
        });
      } else {
      }
    }

    createdLogs.forEach((callLog) => {
      io.emit("callLogCreated", {
        id: callLog.id,
        call_id: callLog.call_id,
        from_user: callLog.from_user,
        to_user: callLog.to_user,
        message: callLog.message,
        image_url: callLog.image_url,
        status: callLog.status,
        created_at: callLog.created_at,
        accepted_at: callLog.accepted_at,
        rejected_at: callLog.rejected_at,
      });
    });


    return res.json({ success: true, callId });
  } catch (err) {
    console.error("Error in POST /api/call:", err);
    return res.status(500).json({ success: false, message: "Server error" });
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
