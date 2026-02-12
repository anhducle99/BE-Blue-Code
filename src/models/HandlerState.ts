import { prisma } from "./db";

export type HandlerStatus = "available" | "handling_this_incident" | "handling_other_incident";

export interface IHandlerState {
  handlerKey: string;
  currentIncidentCaseId: number | null;
  updatedAt: Date;
}

export class HandlerStateModel {
  static async get(handlerKey: string): Promise<IHandlerState | null> {
    const normalized = handlerKey.trim();
    const row = await (prisma as any).handlerState.findUnique({
      where: { handlerKey: normalized },
    });
    return row
      ? { handlerKey: row.handlerKey, currentIncidentCaseId: row.currentIncidentCaseId, updatedAt: row.updatedAt }
      : null;
  }

  static async getStatusForIncident(handlerKey: string, incidentCaseId: number): Promise<HandlerStatus> {
    const state = await this.get(handlerKey);
    if (!state || state.currentIncidentCaseId == null) return "available";
    if (state.currentIncidentCaseId === incidentCaseId) return "handling_this_incident";
    return "handling_other_incident";
  }

  /** Batch: trả về map handlerKey -> currentIncidentCaseId (null nếu không có state). */
  static async getStatusMapForHandlers(handlerKeys: string[]): Promise<Map<string, number | null>> {
    const unique = Array.from(new Set(handlerKeys.map((k) => k.trim()).filter(Boolean)));
    if (unique.length === 0) return new Map();
    const rows = await (prisma as any).handlerState.findMany({
      where: { handlerKey: { in: unique } },
      select: { handlerKey: true, currentIncidentCaseId: true },
    });
    const map = new Map<string, number | null>();
    unique.forEach((k) => map.set(k, null));
    rows.forEach((r: any) => map.set(r.handlerKey, r.currentIncidentCaseId));
    return map;
  }

  static async accept(handlerKey: string, incidentCaseId: number): Promise<void> {
    const normalized = handlerKey.trim();
    const result = await (prisma as any).handlerState.updateMany({
      where: {
        handlerKey: normalized,
        OR: [
          { currentIncidentCaseId: null },
          { currentIncidentCaseId: incidentCaseId },
        ],
      },
      data: { currentIncidentCaseId: incidentCaseId },
    });
    if (result.count > 0) return;
    const row = await (prisma as any).handlerState.findUnique({
      where: { handlerKey: normalized },
    });
    if (row) {
      if (row.currentIncidentCaseId != null && row.currentIncidentCaseId !== incidentCaseId) {
        throw new Error("HANDLER_BUSY");
      }
      await (prisma as any).handlerState.update({
        where: { handlerKey: normalized },
        data: { currentIncidentCaseId: incidentCaseId },
      });
      return;
    }
    try {
      await (prisma as any).handlerState.create({
        data: { handlerKey: normalized, currentIncidentCaseId: incidentCaseId },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        const state = await this.get(handlerKey);
        if (state?.currentIncidentCaseId != null && state.currentIncidentCaseId !== incidentCaseId) {
          throw new Error("HANDLER_BUSY");
        }
        return;
      }
      throw e;
    }
  }

  static async release(handlerKey: string): Promise<void> {
    const normalized = handlerKey.trim();
    await (prisma as any).handlerState.upsert({
      where: { handlerKey: normalized },
      create: { handlerKey: normalized, currentIncidentCaseId: null },
      update: { currentIncidentCaseId: null },
    });
  }

  static async getCurrentIncidentCaseId(handlerKey: string): Promise<number | null> {
    const state = await this.get(handlerKey);
    return state?.currentIncidentCaseId ?? null;
  }
}
