import { prisma } from "./db";

export interface ICallLog {
  id?: number;
  call_id: string;
  from_user: string;
  to_user: string;
  message?: string;
  image_url?: string;
  status?: "pending" | "accepted" | "rejected" | "timeout" | "cancelled" | "unreachable";
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

  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD") 
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  static async findByOrganization(
    organizationId: number,
    filters?: {
      sender?: string;
      receiver?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<ICallLog[]> {
    const orgUsers = await prisma.user.findMany({
      where: { organizationId },
      select: {
        name: true,
        departmentId: true,
      },
    });

    const orgDepartments = await prisma.department.findMany({
      where: {
        OR: [
          { organizationId: organizationId as any },
          {
            users: {
              some: {
                organizationId,
              },
            },
          },
        ],
      },
      select: {
        name: true,
      },
    });

    const orgUserNames = new Set<string>();
    const orgDeptNames = new Set<string>();
    
    orgUsers.forEach((u: { name: string }) => {
      orgUserNames.add(u.name.trim());
      orgUserNames.add(this.normalizeName(u.name));
    });
    
    orgDepartments.forEach((d: { name: string }) => {
      orgDeptNames.add(d.name.trim());
      orgDeptNames.add(this.normalizeName(d.name));
    });

    const allOrgIdentifiers = Array.from(new Set([...orgUserNames, ...orgDeptNames]));

    const whereConditions: any[] = [
      {
        OR: [
          { fromUser: { in: allOrgIdentifiers } },
          { toUser: { in: allOrgIdentifiers } },
        ],
      },
    ];

    if (filters?.sender) {
      whereConditions.push({
        OR: [
          { fromUser: { equals: filters.sender, mode: "insensitive" } },
          { fromUser: { contains: filters.sender, mode: "insensitive" } },
        ],
      });
    }

    if (filters?.receiver) {
      whereConditions.push({
        OR: [
          { toUser: { equals: filters.receiver, mode: "insensitive" } },
          { toUser: { contains: filters.receiver, mode: "insensitive" } },
        ],
      });
    }

    if (filters?.startDate || filters?.endDate) {
      const dateFilter: any = {};
      if (filters.startDate) {
        dateFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
      whereConditions.push({ createdAt: dateFilter });
    }

    const where: any = whereConditions.length > 1 ? { AND: whereConditions } : whereConditions[0];

    const logs = await prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const filteredLogs = logs.filter((log: any) => {
      const fromUserNormalized = this.normalizeName(log.fromUser);
      const toUserNormalized = this.normalizeName(log.toUser);
      const fromUserOriginal = log.fromUser.trim();
      const toUserOriginal = log.toUser.trim();

      return (
        orgUserNames.has(fromUserNormalized) ||
        orgUserNames.has(fromUserOriginal) ||
        orgDeptNames.has(fromUserNormalized) ||
        orgDeptNames.has(fromUserOriginal) ||
        orgUserNames.has(toUserNormalized) ||
        orgUserNames.has(toUserOriginal) ||
        orgDeptNames.has(toUserNormalized) ||
        orgDeptNames.has(toUserOriginal)
      );
    });

    return filteredLogs.map((log: any) => ({
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
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
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
    } else if (status === "rejected" || status === "timeout" || status === "unreachable" || status === "cancelled") {
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
