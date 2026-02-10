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

  static async accept(handlerKey: string, incidentCaseId: number): Promise<void> {
    const normalized = handlerKey.trim();
    const existing = await (prisma as any).handlerState.findUnique({
      where: { handlerKey: normalized },
    });
    if (existing && existing.currentIncidentCaseId != null && existing.currentIncidentCaseId !== incidentCaseId) {
      throw new Error("HANDLER_BUSY");
    }
    await (prisma as any).handlerState.upsert({
      where: { handlerKey: normalized },
      create: { handlerKey: normalized, currentIncidentCaseId: incidentCaseId },
      update: { currentIncidentCaseId: incidentCaseId },
    });
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
