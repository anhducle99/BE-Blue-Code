import { Router } from "express";
import { CallLogModel } from "../models/CallLog";
import { getIO, onlineUsers } from "../socketStore";
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
      }
    }


    createdLogs.forEach((callLog) => {
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

      if (organizationId) {
        const roomName = `organization_${organizationId}`;
        io.to(roomName).emit("callLogCreated", callLogData);
      } else {
        io.emit("callLogCreated", callLogData);
      }
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

export default router;
