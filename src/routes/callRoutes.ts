import { Router } from "express";
import { CallLogModel } from "../models/CallLog";
import { IncidentCaseModel } from "../models/IncidentCase";
import { prisma } from "../models/db";
import { getIO, onlineUsers, callTimers, normalizeName, emitCallLogCreated, emitCallLogUpdated } from "../socketStore";
import { getOrganizationIdForCall } from "../services/orgCache";
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

    const canonicalFrom =
      orgDepartments.find(d => normalizeName(d.name) === normalizedFromDept || d.name.trim() === fromDept.trim())?.name
      ?? orgUsers.find(u => normalizeName(u.name) === normalizedFromDept || u.name.trim() === fromDept.trim())?.name
      ?? fromDept;

    const targetNames = targetKeys.map((key: string) => key.split("_")[0]);
    const normalizedTargetNames = targetNames.map(normalizeName);
    const invalidTargets: string[] = [];
    for (let i = 0; i < normalizedTargetNames.length; i++) {
      const normalized = normalizedTargetNames[i];
      const rawTarget = targetNames[i];
      if (!orgNames.has(normalized) && !orgNames.has(rawTarget.trim())) {
        invalidTargets.push(normalized);
      }
    }

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
    const deptUsersMap = new Map<string, typeof orgUsers>();

    orgUsers.forEach((u) => {
      if (u.department_id == null) return;
      const key = String(u.department_id);
      const list = deptUsersMap.get(key);
      if (list) {
        list.push(u);
      } else {
        deptUsersMap.set(key, [u]);
      }
    });

    for (const key of targetKeys) {
      const targetName = key.split("_")[0];
      const normalizedTargetName = normalizeName(targetName);
      const department = orgDepartments.find(
        (dept) => normalizeName(dept.name) === normalizedTargetName || dept.name.trim() === targetName
      );

      if (department) {
        const departmentUsers = deptUsersMap.get(String(department.id)) || [];
        for (const deptUser of departmentUsers) {
          const userKey = `${deptUser.name}_${deptUser.department_name || deptUser.name}`;
          const targetUser = onlineUsers.get(userKey);
          entries.push({
            payload: {
              call_id: callId,
              from_user: canonicalFrom,
              to_user: deptUser.name,
              message: message || undefined,
              image_url: image_url || undefined,
              status: "pending",
            },
            targetUser: targetUser ?? undefined,
          });
        }
      } else {
        const matchedTargetUser = orgUsers.find(
          (u) => normalizeName(u.name) === normalizedTargetName || u.name.trim() === targetName.trim()
        );
        const canonicalTarget = matchedTargetUser?.name ?? targetName;
        const targetUser = onlineUsers.get(key);
        entries.push({
          payload: {
            call_id: callId,
            from_user: canonicalFrom,
            to_user: canonicalTarget,
            message: message || undefined,
            image_url: image_url || undefined,
            status: "pending",
          },
          targetUser: targetUser ?? undefined,
        });
      }
    }

    const createdLogs = await prisma.$transaction(async (tx) => {
      const data = entries.map((e) => ({
        callId,
        fromUser: e.payload.from_user,
        toUser: e.payload.to_user,
        message: e.payload.message ?? null,
        imageUrl: e.payload.image_url ?? null,
        status: (e.payload.status || "pending") as "pending",
      }));
      await (tx as any).callLog.createMany({ data });
      const created = await (tx as any).callLog.findMany({
        where: { callId },
        orderBy: { id: "asc" },
      });
      return created.map((c: any) => ({
        id: c.id,
        call_id: c.callId,
        from_user: c.fromUser,
        to_user: c.toUser,
        message: c.message ?? undefined,
        image_url: c.imageUrl ?? undefined,
        status: c.status,
        created_at: c.createdAt,
        accepted_at: c.acceptedAt ?? undefined,
        rejected_at: c.rejectedAt ?? undefined,
      }));
    });

    entries.forEach((entry) => {
      const targetUser = entry?.targetUser;
      if (targetUser) {
        io.to(targetUser.socketId).emit("incomingCall", {
          callId,
          fromDept,
          toUser: targetUser.name,
          toDept: targetUser.department_name,
          message,
          image_url,
        });
      }
    });

    const receiverNames: string[] = Array.from(
      new Set(createdLogs.map((c: { to_user?: string | null }) => String(c.to_user ?? "").trim()).filter(Boolean))
    );
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

    const timeoutTimer = setTimeout(async () => {
      try {
        const accepted = await prisma.callLog.findFirst({ where: { callId, status: "accepted" } });
        if (accepted) return;
        const updated = await prisma.callLog.updateMany({
          where: { callId, status: "pending" },
          data: { status: "timeout", rejectedAt: new Date() },
        });
        if (updated.count === 0) return;
        const pending = await prisma.callLog.findMany({
          where: { callId, status: "timeout" },
        });
        const ioRef = getIO();
        if (ioRef && organizationId) {
          pending.forEach((log) => {
            ioRef.to(`organization_${organizationId}`).emit("callStatusUpdate", {
              callId, toDept: log.toUser, toUser: log.toUser, status: "timeout",
            });
          });
        }
      } catch (err) {
        console.error("[CallTimeout] Error:", err);
      }
    }, 17000);
    callTimers.set(callId, timeoutTimer);

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
    const { logs } = await CallLogModel.findByOrganization(
      user.organization_id,
      department ? { receiver: department as string } : undefined,
      { limit: 2000 }
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
      const organizationId = await getOrganizationIdForCall(
        callLog.fromUser,
        callLog.toUser
      );

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
