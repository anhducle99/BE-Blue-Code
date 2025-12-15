import { prisma } from "./db";

export interface ICallLog {
  id?: number;
  call_id: string;
  from_user: string;
  to_user: string;
  message?: string;
  image_url?: string;
  status?: "pending" | "accepted" | "rejected" | "unreachable";
  created_at?: Date;
  accepted_at?: Date;
  rejected_at?: Date;
}

export class CallLogModel {
  static async create(callLog: ICallLog): Promise<ICallLog> {
    const {
      call_id,
      from_user,
      to_user,
      message,
      image_url,
      status = "pending",
    } = callLog;

    const created = await prisma.callLog.create({
      data: {
        callId: call_id,
        fromUser: from_user,
        toUser: to_user,
        message,
        imageUrl: image_url,
        status,
      },
    });

    return {
      id: created.id,
      call_id: created.callId,
      from_user: created.fromUser,
      to_user: created.toUser,
      message: created.message || undefined,
      image_url: created.imageUrl || undefined,
      status: created.status as ICallLog["status"],
      created_at: created.createdAt,
      accepted_at: created.acceptedAt || undefined,
      rejected_at: created.rejectedAt || undefined,
    };
  }

  static async findByDepartment(department: string): Promise<ICallLog[]> {
    const logs = await prisma.callLog.findMany({
      where: {
        OR: [{ fromUser: department }, { toUser: department }],
      },
      orderBy: { createdAt: "desc" },
    });

    return logs.map((log: any) => ({
      id: log.id,
      call_id: log.callId,
      from_user: log.fromUser,
      to_user: log.toUser,
      message: log.message || undefined,
      image_url: log.imageUrl || undefined,
      status: log.status as ICallLog["status"],
      created_at: log.createdAt,
      accepted_at: log.acceptedAt || undefined,
      rejected_at: log.rejectedAt || undefined,
    }));
  }

  static async findByFilters(filters: {
    sender?: string;
    receiver?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ICallLog[]> {
    const { sender, receiver, startDate, endDate } = filters;

    const where: any = {};

    if (sender) {
      where.fromUser = { contains: sender, mode: "insensitive" };
    }

    if (receiver) {
      where.toUser = { contains: receiver, mode: "insensitive" };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const logs = await prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return logs.map((log: any) => ({
      id: log.id,
      call_id: log.callId,
      from_user: log.fromUser,
      to_user: log.toUser,
      message: log.message || undefined,
      image_url: log.imageUrl || undefined,
      status: log.status as ICallLog["status"],
      created_at: log.createdAt,
      accepted_at: log.acceptedAt || undefined,
      rejected_at: log.rejectedAt || undefined,
    }));
  }

  static async findByDateRange(
    startDate: string,
    endDate: string
  ): Promise<ICallLog[]> {
    const logs = await prisma.callLog.findMany({
      where: {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return logs.map((log: any) => ({
      id: log.id,
      call_id: log.callId,
      from_user: log.fromUser,
      to_user: log.toUser,
      message: log.message || undefined,
      image_url: log.imageUrl || undefined,
      status: log.status as ICallLog["status"],
      created_at: log.createdAt,
      accepted_at: log.acceptedAt || undefined,
      rejected_at: log.rejectedAt || undefined,
    }));
  }

  static async updateStatus(
    callId: string,
    toUser: string,
    status: ICallLog["status"],
    timestamp?: Date
  ): Promise<ICallLog | null> {
    const updateData: any = { status };

    if (status === "accepted") {
      updateData.acceptedAt = timestamp || new Date();
    } else if (status === "rejected" || status === "unreachable") {
      updateData.rejectedAt = timestamp || new Date();
    }

    const updated = await prisma.callLog.updateMany({
      where: {
        callId,
        toUser,
        ...(status === "unreachable" ? { status: "pending" } : {}),
      },
      data: updateData,
    });

    if (updated.count === 0) return null;

    const log = await prisma.callLog.findFirst({
      where: { callId, toUser },
    });

    if (!log) return null;

    return {
      id: log.id,
      call_id: log.callId,
      from_user: log.fromUser,
      to_user: log.toUser,
      message: log.message || undefined,
      image_url: log.imageUrl || undefined,
      status: log.status as ICallLog["status"],
      created_at: log.createdAt,
      accepted_at: log.acceptedAt || undefined,
      rejected_at: log.rejectedAt || undefined,
    };
  }
}
