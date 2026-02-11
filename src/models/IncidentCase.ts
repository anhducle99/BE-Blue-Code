import { prisma } from "./db";

const INCIDENT_GROUP_WINDOW_MS = 1 * 60 * 1000;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function buildGroupingKey(organizationId: number, receiverNames: string[]): string {
  const sorted = [...receiverNames].map(normalizeName).sort();
  const timeBucket = Math.floor(Date.now() / INCIDENT_GROUP_WINDOW_MS);
  return `${organizationId}_${sorted.join(",")}_${timeBucket}`;
}

export interface IIncidentCase {
  id: number;
  organizationId: number;
  groupingKey: string;
  reportCount: number;
  createdAt: Date;
}

export class IncidentCaseModel {
  static async findOrCreateAndAttach(
    organizationId: number,
    receiverNames: string[],
    callLogIds: number[]
  ): Promise<IIncidentCase> {
    const groupingKey = buildGroupingKey(organizationId, receiverNames);
    const since = new Date(Date.now() - INCIDENT_GROUP_WINDOW_MS);

    const existing = await (prisma as any).incidentCase.findFirst({
      where: {
        organizationId,
        groupingKey,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await (prisma as any).incidentCase.update({
        where: { id: existing.id },
        data: { reportCount: { increment: callLogIds.length } },
      });
      for (const callLogId of callLogIds) {
        await (prisma as any).incidentCaseCallLog.upsert({
          where: { callLogId },
          create: { incidentCaseId: existing.id, callLogId },
          update: {},
        });
      }
      const updated = await (prisma as any).incidentCase.findUnique({
        where: { id: existing.id },
      });
      return {
        id: updated.id,
        organizationId: updated.organizationId,
        groupingKey: updated.groupingKey,
        reportCount: updated.reportCount,
        createdAt: updated.createdAt,
      };
    }

    const created = await (prisma as any).incidentCase.create({
      data: {
        organizationId,
        groupingKey,
        reportCount: callLogIds.length,
      },
    });
    for (const callLogId of callLogIds) {
      await (prisma as any).incidentCaseCallLog.create({
        data: { incidentCaseId: created.id, callLogId },
      });
    }
    return {
      id: created.id,
      organizationId: created.organizationId,
      groupingKey: created.groupingKey,
      reportCount: created.reportCount,
      createdAt: created.createdAt,
    };
  }

  static async findById(id: number): Promise<IIncidentCase | null> {
    const row = await (prisma as any).incidentCase.findUnique({
      where: { id },
    });
    return row ? { id: row.id, organizationId: row.organizationId, groupingKey: row.groupingKey, reportCount: row.reportCount, createdAt: row.createdAt } : null;
  }

  static async findByOrganization(
    organizationId: number,
    options?: { startDate?: string; endDate?: string }
  ): Promise<
    Array<
      IIncidentCase & {
        callLogs: Array<{ callLogId: number }>;
        handlerKeys: string[];
        reporters: string[];
        calls: Array<{ fromUser: string; createdAt: Date }>;
      }
    >
  > {
    const where: any = { organizationId };
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = new Date(options.startDate);
      if (options.endDate) where.createdAt.lte = new Date(options.endDate);
    }
    const list = await (prisma as any).incidentCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        callLogs: { select: { callLogId: true } },
      },
    });
    const result: Array<
      IIncidentCase & {
        callLogs: Array<{ callLogId: number }>;
        handlerKeys: string[];
        reporters: string[];
        calls: Array<{ fromUser: string; createdAt: Date }>;
      }
    > = [];
    for (const row of list) {
      const callLogIds = row.callLogs.map((c: any) => c.callLogId);
      const logs = await prisma.callLog.findMany({
        where: { id: { in: callLogIds } },
        select: { toUser: true, fromUser: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const handlerKeys = Array.from(
        new Set<string>(
          logs
            .map((l: any) => (l.toUser ? String(l.toUser).trim() : ""))
            .filter((v: string) => Boolean(v))
        )
      );
      const reporters = Array.from(
        new Set<string>(
          logs
            .map((l: any) => (l.fromUser ? String(l.fromUser).trim() : ""))
            .filter((v: string) => Boolean(v))
        )
      );
      const calls = logs.map((l: any) => ({
        fromUser: l.fromUser?.trim() || "",
        createdAt: l.createdAt,
      }));
      result.push({
        id: row.id,
        organizationId: row.organizationId,
        groupingKey: row.groupingKey,
        reportCount: row.reportCount,
        createdAt: row.createdAt,
        callLogs: row.callLogs,
        handlerKeys,
        reporters,
        calls,
      });
    }
    return result;
  }
}
