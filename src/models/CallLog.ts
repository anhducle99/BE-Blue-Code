import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ICallLog {
  id?: number;
  call_id: string;
  from_user: string;
  to_user: string;
  message?: string;
  image_url?: string;
  status?: "pending" | "accepted" | "rejected" | "timeout" | "cancelled" | "unreachable";
  organization_id?: number | null;
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
      organization_id,
    } = callLog;

    const created = await prisma.callLog.create({
      data: {
        callId: call_id,
        fromUser: from_user,
        toUser: to_user,
        message,
        imageUrl: image_url,
        status,
        organizationId: organization_id ?? null,
      } as any,
    });

    return {
      id: created.id,
      call_id: created.callId,
      from_user: created.fromUser,
      to_user: created.toUser,
      message: created.message || undefined,
      image_url: created.imageUrl || undefined,
      status: created.status as ICallLog["status"],
      organization_id: (created as any).organizationId ?? undefined,
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
    },
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: ICallLog[]; total: number }> {
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

    const identSub = Prisma.sql`(
      SELECT lower(trim(name)) FROM users WHERE organization_id = ${organizationId}
      UNION
      SELECT lower(trim(d.name)) FROM departments d
      WHERE d.organization_id = ${organizationId}
         OR d.id IN (
           SELECT DISTINCT department_id FROM users
           WHERE organization_id = ${organizationId} AND department_id IS NOT NULL
         )
    )`;

    const legacyScope = Prisma.sql`(lower(trim(from_user)) IN ${identSub} OR lower(trim(to_user)) IN ${identSub})`;
    let where = Prisma.sql`(organization_id = ${organizationId} OR (organization_id IS NULL AND ${legacyScope}))`;

    if (filters?.sender) {
      const p = `%${escapeLike(filters.sender)}%`;
      where = Prisma.sql`${where} AND from_user ILIKE ${p}`;
    }
    if (filters?.receiver) {
      const p = `%${escapeLike(filters.receiver)}%`;
      where = Prisma.sql`${where} AND to_user ILIKE ${p}`;
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      where = Prisma.sql`${where} AND created_at >= ${start}`;
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where = Prisma.sql`${where} AND created_at <= ${end}`;
    }

    const usePagination = options?.limit != null || options?.offset != null;

    if (usePagination) {
      const limit = Math.min(2000, Math.max(1, options?.limit ?? 500));
      const offset = Math.max(0, options?.offset ?? 0);

      const [countResult, logs] = await Promise.all([
        prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*)::int as count FROM call_logs WHERE ${where}
        `,
        prisma.$queryRaw<any[]>`
          SELECT id, call_id as "callId", from_user as "fromUser", to_user as "toUser",
            message, image_url as "imageUrl", status,
            created_at as "createdAt", accepted_at as "acceptedAt", rejected_at as "rejectedAt"
          FROM call_logs WHERE ${where}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ]);

      return {
        logs: logs.map((log: any) => ({
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
        })),
        total: countResult[0]?.count ?? 0,
      };
    }

    const logs = await prisma.$queryRaw<any[]>`
      SELECT id, call_id as "callId", from_user as "fromUser", to_user as "toUser",
        message, image_url as "imageUrl", status,
        created_at as "createdAt", accepted_at as "acceptedAt", rejected_at as "rejectedAt"
      FROM call_logs WHERE ${where}
      ORDER BY created_at DESC
    `;

    return {
      logs: logs.map((log: any) => ({
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
      })),
      total: logs.length,
    };
  }

  static async findByFilters(filters: {
    sender?: string;
    receiver?: string;
    startDate?: string;
    endDate?: string;
  }, options?: { limit?: number; offset?: number }): Promise<{ logs: ICallLog[]; total: number }> {
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

    const usePagination = options?.limit != null || options?.offset != null;
    const limit = usePagination ? Math.min(2000, Math.max(1, options?.limit ?? 500)) : undefined;
    const offset = usePagination ? Math.max(0, options?.offset ?? 0) : undefined;

    const findManyArgs: any = {
      where,
      orderBy: { createdAt: "desc" as const },
    };
    if (limit != null) findManyArgs.take = limit;
    if (offset != null) findManyArgs.skip = offset;

    const [logs, total] = await Promise.all([
      prisma.callLog.findMany(findManyArgs),
      usePagination ? prisma.callLog.count({ where }) : Promise.resolve(0),
    ]);
    const resolvedTotal = usePagination ? total : logs.length;

    return {
      logs: logs.map((log: any) => ({
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
      })),
      total: resolvedTotal,
    };
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
    timestamp?: Date,
    organizationId?: number | null
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
        status: "pending",
        ...(typeof organizationId === "number" ? { organizationId } : {}),
      },
      data: updateData,
    });

    if (updated.count === 0) return null;

    const log = await prisma.callLog.findFirst({
      where: {
        callId,
        toUser,
        ...(typeof organizationId === "number" ? { organizationId } : {}),
      },
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
