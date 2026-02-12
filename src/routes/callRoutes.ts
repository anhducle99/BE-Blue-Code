import { Router } from "express";
import { CallLogModel } from "../models/CallLog";
import { IncidentCaseModel } from "../models/IncidentCase";
import { prisma } from "../models/db";
import { getIO, onlineUsers, callTimers, normalizeName, emitCallLogCreated, emitCallLogUpdated } from "../socketStore";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/authMiddleware";
import { validateCallPermission } from "../middleware/validateCallPermission";

const router = Router();

router.post("/", authMiddleware, validateCallPermission, async (req, res) => {
  try {
    const { targetKeys, message, fromDept, image_url } = req.body;
    const userFull = (req as any).userFull;
    const organizationId = userFull?.organization_id;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào"
      });
    }

    const normalizeName = (name: string): string => {
      return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "")
        .trim();
    };

    const { UserModel } = await import("../models/User");
    const { DepartmentModel } = await import("../models/Department");
    const orgUsers = await UserModel.findAll(organizationId);
    const orgDepartments = await DepartmentModel.findAll(organizationId);
    const orgNames = new Set<string>();
    orgUsers.forEach((user) => {
      orgNames.add(normalizeName(user.name));
      orgNames.add(user.name.trim());
    });
    orgDepartments.forEach((dept) => {
      orgNames.add(normalizeName(dept.name));
      orgNames.add(dept.name.trim());
    });

    const normalizedFromDept = normalizeName(fromDept);
    if (!orgNames.has(normalizedFromDept) && !orgNames.has(fromDept.trim())) {
      return res.status(403).json({
        success: false,
        message: "Không thể gọi từ department/user không thuộc organization của bạn"
      });
    }

    const targetNames = targetKeys.map((key: string) => key.split("_")[0]);
    const normalizedTargetNames = targetNames.map(normalizeName);
    const invalidTargets = normalizedTargetNames.filter(
      (name: string) => !orgNames.has(name) && !orgNames.has(targetNames[normalizedTargetNames.indexOf(name)].trim())
    );

    if (invalidTargets.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Không thể gọi đến: ${invalidTargets.join(", ")} (không thuộc organization)`
      });
    }

    const io = getIO();
    if (!io) {
      return res.status(500).json({ success: false, message: "Socket.IO not initialized" });
    }

    const callId = randomUUID();
    type CreateEntry = { payload: Parameters<typeof CallLogModel.create>[0]; targetUser: ReturnType<typeof onlineUsers.get> };
    const entries: CreateEntry[] = [];

    for (const key of targetKeys) {
      const targetName = key.split("_")[0];
      const normalizedTargetName = normalizeName(targetName);
      const isDepartment = orgDepartments.some(
        (dept) => normalizeName(dept.name) === normalizedTargetName || dept.name.trim() === targetName
      );

      if (isDepartment) {
        const department = orgDepartments.find(
          (dept) => normalizeName(dept.name) === normalizedTargetName || dept.name.trim() === targetName
        );
        if (department) {
          const departmentUsers = orgUsers.filter(
            (u) => {
              const deptIdMatch = u.department_id === department.id ||
                  u.department_id === Number(department.id) ||
                  Number(u.department_id) === department.id ||
                  String(u.department_id) === String(department.id);
              return deptIdMatch && u.department_id != null;
            }
          );
          for (const deptUser of departmentUsers) {
            const userKey = `${deptUser.name}_${deptUser.department_name || deptUser.name}`;
            const targetUser = onlineUsers.get(userKey);
            entries.push({
              payload: {
                call_id: callId,
                from_user: fromDept,
                to_user: deptUser.name,
                message: message || undefined,
                image_url: image_url || undefined,
                status: "pending",
              },
              targetUser: targetUser ?? undefined,
            });
          }
        }
      } else {
        const targetUser = onlineUsers.get(key);
        entries.push({
          payload: {
            call_id: callId,
            from_user: fromDept,
            to_user: targetName,
            message: message || undefined,
            image_url: image_url || undefined,
            status: "pending",
          },
          targetUser: targetUser ?? undefined,
        });
      }
    }

    const createdLogs = await prisma.$transaction(async (tx) => {
      const out: any[] = [];
      for (const e of entries) {
        const p = e.payload;
        const created = await (tx as any).callLog.create({
          data: {
            callId: p.call_id,
            fromUser: p.from_user,
            toUser: p.to_user,
            message: p.message,
            imageUrl: p.image_url,
            status: p.status || "pending",
          },
        });
        out.push({
          id: created.id,
          call_id: created.callId,
          from_user: created.fromUser,
          to_user: created.toUser,
          message: created.message ?? undefined,
          image_url: created.imageUrl ?? undefined,
          status: created.status,
          created_at: created.createdAt,
          accepted_at: created.acceptedAt ?? undefined,
          rejected_at: created.rejectedAt ?? undefined,
        });
      }
      return out;
    });

    createdLogs.forEach((callLog: any, i: number) => {
      const targetUser = entries[i]?.targetUser;
      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          fromDept,
          toDept: targetUser.department_name,
          message,
          image_url,
        });
      }
    });

    const receiverNames = [...new Set(createdLogs.map((c: any) => c.to_user?.trim()).filter(Boolean))];
    const callLogIds = createdLogs.map((c: any) => c.id);
    const reporterCount = new Set(createdLogs.map((c: any) => (c.from_user || "").trim()).filter(Boolean)).size;
    if (receiverNames.length > 0 && callLogIds.length > 0) {
      await IncidentCaseModel.findOrCreateAndAttach(organizationId, receiverNames, callLogIds, reporterCount, message || "");
    }

    createdLogs.forEach((callLog: any) => {
      const callLogData = {
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
      };

      emitCallLogCreated(callLogData, organizationId);
    });


    return res.json({ success: true, callId });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng"
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);

    if (!user || !user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào"
      });
    }

    const { department } = req.query;
    const logs = await CallLogModel.findByOrganization(
      user.organization_id,
      department ? { receiver: department as string } : undefined
    );

    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ 
      success: false,
      message: "Lỗi server khi lấy danh sách cuộc gọi"
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
        message: "Không tìm thấy thông tin người dùng"
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const fromDept = user.department_name || user.name;
    const { prisma } = await import("../models/db");
    const callLog = await prisma.callLog.findFirst({
      where: { callId },
    });

    if (!callLog) {
      return res.status(404).json({
        success: false,
        message: "Call not found"
      });
    }

    const normalizedFrom = normalizeName(fromDept);
    const normalizedSender = normalizeName(callLog.fromUser);
    
    if (normalizedFrom !== normalizedSender && callLog.fromUser !== fromDept) {
      return res.status(403).json({
        success: false,
        message: "Only sender can cancel call"
      });
    }

    if (callLog.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Call already ${callLog.status}`
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
        message: "No pending calls found to cancel"
      });
    }

    const updatedLogs = await prisma.callLog.findMany({
      where: { callId },
    });

    const io = getIO();
    if (io) {
      let senderUser = null;
      const fromUserId = parseInt(callLog.fromUser);
      if (!isNaN(fromUserId)) {
        senderUser = await UserModel.findById(fromUserId);
      }
      if (!senderUser) {
        const userByName = await prisma.user.findFirst({
          where: { name: callLog.fromUser },
          select: { organizationId: true }
        });
        if (userByName) senderUser = { organization_id: userByName.organizationId };
      }

      let receiverUser = null;
      const toUserId = parseInt(callLog.toUser);
      if (!isNaN(toUserId)) {
        receiverUser = await UserModel.findById(toUserId);
      }
      if (!receiverUser) {
        const userByName = await prisma.user.findFirst({
          where: { name: callLog.toUser },
          select: { organizationId: true }
        });
        if (userByName) receiverUser = { organization_id: userByName.organizationId };
      }

      const organizationId = senderUser?.organization_id || receiverUser?.organization_id;

      const emittedLogIds = new Set<number>();
      
      type CallLogRow = { id: number; callId: string; fromUser: string; toUser: string; message?: string | null; imageUrl?: string | null; status: string; createdAt: Date; acceptedAt?: Date | null; rejectedAt?: Date | null };
      updatedLogs.forEach((log: CallLogRow) => {
        if (emittedLogIds.has(log.id)) {
          return;
        }
        emittedLogIds.add(log.id);

        const callLogData = {
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
        };

        if (organizationId) {
          const roomName = `organization_${organizationId}`;
          io.to(roomName).emit("callStatusUpdate", {
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

        emitCallLogUpdated(callLogData, organizationId ?? undefined);
      });
    }

    res.json({
      success: true,
      message: "Call cancelled successfully",
      cancelledCount: updated.count,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
