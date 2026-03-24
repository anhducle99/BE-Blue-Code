import { randomUUID } from "crypto";
import { IncidentCaseModel } from "../models/IncidentCase";
import { prisma } from "../models/db";
import { DepartmentModel } from "../models/Department";
import { UserModel } from "../models/User";
import {
  buildOnlineUserKey,
  callTimers,
  emitCallLogCreated,
  emitCallLogUpdated,
  getIO,
  normalizeName,
  onlineUsers,
  type OnlineUser,
} from "../socketStore";

const CALL_PENDING_TIMEOUT_MS = 17000;

type DispatchOutgoingCallInput = {
  organizationId: number;
  fromDept: string;
  targetKeys: string[];
  excludeUserNames?: string[];
  message?: string;
  imageUrl?: string;
};

type PendingCallPayload = {
  call_id: string;
  from_user: string;
  to_user: string;
  message?: string;
  image_url?: string;
  status: "pending";
};

type CreatedCallLog = {
  id: number;
  call_id: string;
  from_user: string;
  to_user: string;
  message?: string;
  image_url?: string;
  status: string;
  created_at: Date;
  accepted_at?: Date;
  rejected_at?: Date;
};

type DispatchEntry = {
  payload: PendingCallPayload;
  targetUser?: OnlineUser;
};

export class CallDispatchError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const trimValue = (value?: string | null) => String(value || "").trim();

const findCanonicalName = (
  rawName: string,
  users: Array<{ name: string }>,
  departments: Array<{ name: string }>
) => {
  const trimmedName = trimValue(rawName);
  const normalizedName = normalizeName(trimmedName);

  return (
    departments.find(
      (item) => normalizeName(item.name) === normalizedName || trimValue(item.name) === trimmedName
    )?.name ??
    users.find((item) => normalizeName(item.name) === normalizedName || trimValue(item.name) === trimmedName)?.name ??
    trimmedName
  );
};

const mapCreatedLog = (callLog: any): CreatedCallLog => ({
  id: callLog.id,
  call_id: callLog.callId,
  from_user: callLog.fromUser,
  to_user: callLog.toUser,
  message: callLog.message ?? undefined,
  image_url: callLog.imageUrl ?? undefined,
  status: callLog.status,
  created_at: callLog.createdAt,
  accepted_at: callLog.acceptedAt ?? undefined,
  rejected_at: callLog.rejectedAt ?? undefined,
});

const scheduleCallTimeout = (callId: string, organizationId: number) => {
  const timeoutTimer = setTimeout(async () => {
    try {
      const accepted = await prisma.callLog.findFirst({
        where: { callId, status: "accepted", organizationId },
      });

      if (accepted) return;

      const updated = await prisma.callLog.updateMany({
        where: { callId, status: "pending", organizationId },
        data: { status: "timeout", rejectedAt: new Date() },
      });

      if (updated.count === 0) return;

      const timedOutLogs = await prisma.callLog.findMany({
        where: { callId, status: "timeout", organizationId },
      });

      const io = getIO();
      if (!io) return;

      timedOutLogs.forEach((log) => {
        io.to(`organization_${organizationId}`).emit("callStatusUpdate", {
          callId,
          toDept: log.toUser,
          toUser: log.toUser,
          status: "timeout",
        });

        emitCallLogUpdated(mapCreatedLog(log), organizationId);
      });
    } catch (error) {
      console.error("[CallTimeout] Error:", error);
    }
  }, CALL_PENDING_TIMEOUT_MS);

  callTimers.set(callId, timeoutTimer);
};

export const dispatchOutgoingCall = async ({
  organizationId,
  fromDept,
  targetKeys,
  excludeUserNames = [],
  message,
  imageUrl,
}: DispatchOutgoingCallInput) => {
  if (typeof organizationId !== "number") {
    throw new CallDispatchError(403, "User không thuộc organization nào");
  }

  const requestedFromDept = trimValue(fromDept);
  if (!requestedFromDept) {
    throw new CallDispatchError(400, "Thiếu thông tin vị trí sự cố");
  }

  if (!Array.isArray(targetKeys) || targetKeys.length === 0) {
    throw new CallDispatchError(400, "Thiếu danh sách người nhận");
  }

  const io = getIO();
  if (!io) {
    throw new CallDispatchError(500, "Socket.IO chưa được khởi tạo");
  }

  const [orgUsers, orgDepartments] = await Promise.all([
    UserModel.findAll(organizationId),
    DepartmentModel.findAll(organizationId),
  ]);

  const orgNames = new Set<string>();
  orgUsers.forEach((user) => {
    const safeName = trimValue(user.name);
    if (!safeName) return;
    orgNames.add(normalizeName(safeName));
    orgNames.add(safeName);
  });
  orgDepartments.forEach((department) => {
    const safeName = trimValue(department.name);
    if (!safeName) return;
    orgNames.add(normalizeName(safeName));
    orgNames.add(safeName);
  });

  const normalizedFromDept = normalizeName(requestedFromDept);
  if (!orgNames.has(normalizedFromDept) && !orgNames.has(requestedFromDept)) {
    throw new CallDispatchError(
      403,
      "Không thể gọi từ department/user không thuộc organization của bạn"
    );
  }

  const canonicalFrom = findCanonicalName(requestedFromDept, orgUsers, orgDepartments);
  const targetNames = targetKeys
    .map((key) => trimValue(String(key).split("_")[0]))
    .filter((key) => !!key);

  if (targetNames.length === 0) {
    throw new CallDispatchError(400, "Thiếu danh sách người nhận hợp lệ");
  }

  const invalidTargets = targetNames.filter((targetName) => {
    const normalizedTargetName = normalizeName(targetName);
    return !orgNames.has(normalizedTargetName) && !orgNames.has(targetName);
  });

  if (invalidTargets.length > 0) {
    throw new CallDispatchError(
      403,
      `Không thể gọi đến: ${invalidTargets.join(", ")} (không thuộc organization)`
    );
  }

  const callId = randomUUID();
  const deptUsersMap = new Map<string, Array<(typeof orgUsers)[number]>>();
  const excludedUserNamesNormalized = new Set(
    excludeUserNames.map((userName) => normalizeName(trimValue(userName))).filter((userName) => !!userName)
  );

  orgUsers.forEach((user) => {
    if (user.department_id == null) return;
    const departmentKey = String(user.department_id);
    const list = deptUsersMap.get(departmentKey);
    if (list) {
      list.push(user);
    } else {
      deptUsersMap.set(departmentKey, [user]);
    }
  });

  const entries: DispatchEntry[] = [];

  for (const targetName of targetNames) {
    const normalizedTargetName = normalizeName(targetName);
    const department = orgDepartments.find(
      (item) =>
        normalizeName(item.name) === normalizedTargetName || trimValue(item.name) === trimValue(targetName)
    );

    if (department) {
      const departmentUsers = deptUsersMap.get(String(department.id)) || [];
      departmentUsers.forEach((departmentUser) => {
        if (excludedUserNamesNormalized.has(normalizeName(trimValue(departmentUser.name)))) {
          return;
        }

        const userKey = buildOnlineUserKey(
          departmentUser.name,
          departmentUser.department_name || departmentUser.name,
          organizationId
        );
        entries.push({
          payload: {
            call_id: callId,
            from_user: canonicalFrom,
            to_user: departmentUser.name,
            message: message || undefined,
            image_url: imageUrl || undefined,
            status: "pending",
          },
          targetUser: onlineUsers.get(userKey) ?? undefined,
        });
      });
      continue;
    }

    const matchedTargetUser = orgUsers.find(
      (user) => normalizeName(user.name) === normalizedTargetName || trimValue(user.name) === trimValue(targetName)
    );

    if (
      matchedTargetUser &&
      excludedUserNamesNormalized.has(normalizeName(trimValue(matchedTargetUser.name)))
    ) {
      continue;
    }

    const canonicalTarget = matchedTargetUser?.name ?? targetName;
    const targetUser = onlineUsers.get(
      buildOnlineUserKey(
        canonicalTarget,
        matchedTargetUser?.department_name || canonicalTarget,
        organizationId
      )
    );

    entries.push({
      payload: {
        call_id: callId,
        from_user: canonicalFrom,
        to_user: canonicalTarget,
        message: message || undefined,
        image_url: imageUrl || undefined,
        status: "pending",
      },
      targetUser: targetUser ?? undefined,
    });
  }

  if (entries.length === 0) {
    throw new CallDispatchError(400, "Không tìm thấy người nhận hợp lệ để thực hiện cuộc gọi");
  }

  const createdLogs = await prisma.$transaction(async (tx) => {
    await tx.callLog.createMany({
      data: entries.map((entry) => ({
        callId,
        fromUser: entry.payload.from_user,
        toUser: entry.payload.to_user,
        message: entry.payload.message ?? null,
        imageUrl: entry.payload.image_url ?? null,
        status: entry.payload.status,
        organizationId,
      })),
    });

    const created = await tx.callLog.findMany({
      where: { callId, organizationId },
      orderBy: { id: "asc" },
    });

    return created.map(mapCreatedLog);
  });

  entries.forEach((entry) => {
    if (!entry.targetUser) return;
    io.to(entry.targetUser.socketId).emit("incomingCall", {
      callId,
      fromDept: canonicalFrom,
      toUser: entry.targetUser.name,
      toDept: entry.targetUser.department_name,
      message,
      image_url: imageUrl,
    });
  });

  const receiverNames = Array.from(
    new Set(createdLogs.map((callLog) => trimValue(callLog.to_user)).filter(Boolean))
  );
  const callLogIds = createdLogs.map((callLog) => callLog.id);
  const reporterCount = new Set(
    createdLogs.map((callLog) => trimValue(callLog.from_user)).filter(Boolean)
  ).size;

  if (receiverNames.length > 0 && callLogIds.length > 0) {
    await IncidentCaseModel.findOrCreateAndAttach(
      organizationId,
      receiverNames,
      callLogIds,
      reporterCount,
      message || ""
    );
  }

  createdLogs.forEach((callLog) => {
    emitCallLogCreated(callLog, organizationId);
  });

  scheduleCallTimeout(callId, organizationId);

  return {
    callId,
    canonicalFrom,
    receiverNames,
    createdLogs,
  };
};
