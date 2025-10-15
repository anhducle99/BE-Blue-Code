import { Router, Request, Response } from "express";
import { getIO, onlineUsers } from "../socketStore";

const router = Router();

router.post("/", (req: Request, res: Response) => {
  const { targetPhones, message } = req.body;

  if (!targetPhones?.length) {
    return res.status(400).json({
      success: false,
      message: "Missing targetPhones",
    });
  }

  const callId = Date.now().toString();
  const io = getIO();

  targetPhones.forEach((phone: string | number) => {
    const socketId = onlineUsers[phone];
    if (socketId) {
      io.to(socketId).emit("incomingCall", { callId, message });
    }
  });

  res.json({ success: true, callId });
});

export default router;
