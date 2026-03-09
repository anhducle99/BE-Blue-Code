import { prisma } from "./db";

export type HandlerStatus = "available" | "handling_this_incident" | "handling_other_incident";

export interface IHandlerState {
  handlerKey: string;
  currentIncidentCaseId: number | null;
  updatedAt: Date;
}

export class HandlerStateModel {
  private static buildScopedHandlerKey(
    handlerKey: string,
    organizationId?: number | null
  ): string {
    const normalized = handlerKey.trim();
    const scope =
      typeof organizationId === "number" && organizationId > 0 ? organizationId : "global";
    return `${scope}:${normalized}`;
  }

  static async get(
    handlerKey: string,
    organizationId?: number | null
  ): Promise<IHandlerState | null> {
    const scopedKey = this.buildScopedHandlerKey(handlerKey, organizationId);
    const row = await (prisma as any).handlerState.findUnique({
      where: { handlerKey: scopedKey },
    });
    return row
      ? { handlerKey: handlerKey.trim(), currentIncidentCaseId: row.currentIncidentCaseId, updatedAt: row.updatedAt }
      : null;
  }

  static async getStatusForIncident(
    handlerKey: string,
    incidentCaseId: number,
    organizationId?: number | null
  ): Promise<HandlerStatus> {
    const state = await this.get(handlerKey, organizationId);
    if (!state || state.currentIncidentCaseId == null) return "available";
    if (state.currentIncidentCaseId === incidentCaseId) return "handling_this_incident";
    return "handling_other_incident";
  }

  static async getStatusMapForHandlers(
    handlerKeys: string[],
    organizationId?: number | null
  ): Promise<Map<string, number | null>> {
    const unique = Array.from(new Set(handlerKeys.map((k) => k.trim()).filter(Boolean)));
    if (unique.length === 0) return new Map();
    const scopedEntries = unique.map((key) => ({
      rawKey: key,
      scopedKey: this.buildScopedHandlerKey(key, organizationId),
    }));
    const rows = await (prisma as any).handlerState.findMany({
      where: { handlerKey: { in: scopedEntries.map((entry) => entry.scopedKey) } },
      select: { handlerKey: true, currentIncidentCaseId: true },
    });
    const map = new Map<string, number | null>();
    unique.forEach((k) => map.set(k, null));
    const rawKeyByScopedKey = new Map(
      scopedEntries.map((entry) => [entry.scopedKey, entry.rawKey])
    );
    rows.forEach((r: any) => {
      const rawKey = rawKeyByScopedKey.get(r.handlerKey);
      if (rawKey) {
        map.set(rawKey, r.currentIncidentCaseId);
      }
    });
    return map;
  }

  static async accept(
    handlerKey: string,
    incidentCaseId: number,
    organizationId?: number | null
  ): Promise<void> {
    const scopedKey = this.buildScopedHandlerKey(handlerKey, organizationId);
    const result = await (prisma as any).handlerState.updateMany({
      where: {
        handlerKey: scopedKey,
        OR: [
          { currentIncidentCaseId: null },
          { currentIncidentCaseId: incidentCaseId },
        ],
      },
      data: { currentIncidentCaseId: incidentCaseId },
    });
    if (result.count > 0) return;
    const row = await (prisma as any).handlerState.findUnique({
      where: { handlerKey: scopedKey },
    });
    if (row) {
      if (row.currentIncidentCaseId != null && row.currentIncidentCaseId !== incidentCaseId) {
        throw new Error("HANDLER_BUSY");
      }
      await (prisma as any).handlerState.update({
        where: { handlerKey: scopedKey },
        data: { currentIncidentCaseId: incidentCaseId },
      });
      return;
    }
    try {
      await (prisma as any).handlerState.create({
        data: { handlerKey: scopedKey, currentIncidentCaseId: incidentCaseId },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        const state = await this.get(handlerKey, organizationId);
        if (state?.currentIncidentCaseId != null && state.currentIncidentCaseId !== incidentCaseId) {
          throw new Error("HANDLER_BUSY");
        }
        return;
      }
      throw e;
    }
  }

  static async release(handlerKey: string, organizationId?: number | null): Promise<void> {
    const scopedKey = this.buildScopedHandlerKey(handlerKey, organizationId);
    await (prisma as any).handlerState.upsert({
      where: { handlerKey: scopedKey },
      create: { handlerKey: scopedKey, currentIncidentCaseId: null },
      update: { currentIncidentCaseId: null },
    });
  }

  static async getCurrentIncidentCaseId(
    handlerKey: string,
    organizationId?: number | null
  ): Promise<number | null> {
    const state = await this.get(handlerKey, organizationId);
    return state?.currentIncidentCaseId ?? null;
  }
}
