import { Router } from "express";
import { pool } from "../models/db";
import { getIO, onlineUsers } from "../socketStore";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { targetKeys, message, fromDept, image_url } = req.body;
    const io = getIO();
    const callId = uuidv4();

    for (const key of targetKeys) {
      const targetUser = onlineUsers.get(key);

      await pool.query(
        `INSERT INTO call_logs (call_id, from_user, to_user, message, image_url, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
        [
          callId,
          fromDept,
          key.split("_")[0],
          message || null,
          image_url || null,
        ]
      );

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
    const { rows } = await pool.query(
      `
      SELECT * FROM call_logs
      WHERE from_user = $1 OR to_user = $1
      ORDER BY created_at DESC
    `,
      [department]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error in GET /api/call:", err);
    res.status(500).json({ success: false });
  }
});

export default router;
