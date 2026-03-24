import { Router } from "express";
import { CallLogModel } from "../models/CallLog";
import { prisma } from "../models/db";
import { callTimers, emitCallLogUpdated, getIO, normalizeName } from "../socketStore";
import { authMiddleware } from "../middleware/authMiddleware";
import { validateCallPermission } from "../middleware/validateCallPermission";
import { CallDispatchError, dispatchOutgoingCall } from "../services/callDispatchService";

const router = Router();

router.post("/", authMiddleware, validateCallPermission, async (req, res) => {
  try {
    const { targetKeys, message, fromDept, image_url } = req.body;
    const userFull = (req as any).userFull;

    const result = await dispatchOutgoingCall({
      organizationId: userFull?.organization_id,
      fromDept,
      targetKeys,
      excludeUserNames: userFull?.name ? [userFull.name] : [],
      message,
      imageUrl: image_url,
    });

    return res.json({
      success: true,
      callId: result.callId,
    });
  } catch (error) {
    if (error instanceof CallDispatchError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);

    if (!user || !user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào",
      });
    }

    const { department } = req.query;
    const { logs } = await CallLogModel.findByOrganization(
      user.organization_id,
      department ? { receiver: department as string } : undefined,
      { limit: 2000 }
    );

    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách cuộc gọi",
    });
  }
});

router.post("/:callId/cancel", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { callId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (!user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào",
      });
    }

    const fromDept = user.department_name || user.name;
    const organizationId = user.organization_id;
    const callLog = await prisma.callLog.findFirst({
      where: { callId, organizationId },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cuộc gọi",
      });
    }

    const normalizedFrom = normalizeName(fromDept);
    const normalizedSender = normalizeName(callLog.fromUser);

    if (normalizedFrom !== normalizedSender && callLog.fromUser !== fromDept) {
      return res.status(403).json({
        success: false,
        message: "Chỉ người gửi mới có thể hủy cuộc gọi",
      });
    }

    if (callLog.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Call already ${callLog.status}`,
      });
    }

    const timer = callTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      callTimers.delete(callId);
    }

    const updated = await prisma.callLog.updateMany({
      where: {
        callId,
        organizationId,
        status: "pending",
      },
      data: {
        status: "cancelled",
        rejectedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return res.status(400).json({
        success: false,
        message: "Không tìm thấy cuộc gọi chờ để hủy",
      });
    }

    const updatedLogs = await prisma.callLog.findMany({
      where: { callId, organizationId },
    });

    const io = getIO();
    if (io) {
      const emittedLogIds = new Set<number>();

      updatedLogs.forEach((log) => {
        if (emittedLogIds.has(log.id)) {
          return;
        }
        emittedLogIds.add(log.id);

        if (organizationId) {
          io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
            callId,
            toDept: log.toUser,
            status: "cancelled",
          });
        } else {
          io.emit("callStatusUpdate", {
            callId,
            toDept: log.toUser,
            status: "cancelled",
          });
        }

        emitCallLogUpdated(
          {
            id: log.id,
            call_id: log.callId,
            from_user: log.fromUser,
            to_user: log.toUser,
            message: log.message || undefined,
            image_url: log.imageUrl || undefined,
            status: log.status,
            created_at: log.createdAt,
            accepted_at: log.acceptedAt || undefined,
            rejected_at: log.rejectedAt || undefined,
          },
          organizationId ?? undefined
        );
      });
    }

    res.json({
      success: true,
      message: "Đã hủy cuộc gọi thành công",
      cancelledCount: updated.count,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Lỗi server nội bộ",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
