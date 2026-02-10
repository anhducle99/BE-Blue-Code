import { Request, Response } from "express";
import { IncidentCaseModel } from "../models/IncidentCase";
import { HandlerStateModel } from "../models/HandlerState";
import { emitHandlerStatusChange } from "../socketStore";

export const getIncidentCases = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
    }
    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, message: "User không tồn tại" });
    }
    let organizationId: number;
    if (userRole === "SuperAdmin") {
      const queryOrgId = req.query.organization_id;
      const parsed = queryOrgId != null ? parseInt(String(queryOrgId), 10) : NaN;
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ success: false, message: "SuperAdmin cần truyền organization_id" });
      }
      organizationId = parsed;
    } else {
      if (!user.organization_id) {
        return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
      }
      organizationId = user.organization_id;
    }
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const list = await IncidentCaseModel.findByOrganization(organizationId, { startDate, endDate });
    const withStatus = [];
    for (const row of list) {
      const handlers = [];
      for (const key of row.handlerKeys) {
        const status = await HandlerStateModel.getStatusForIncident(key, row.id);
        handlers.push({ handlerKey: key, status });
      }
      withStatus.push({
        id: row.id,
        organizationId: row.organizationId,
        groupingKey: row.groupingKey,
        reportCount: row.reportCount,
        createdAt: row.createdAt,
        handlerKeys: row.handlerKeys,
        reporters: row.reporters || [],
        calls: (row as any).calls || [],
        handlers,
      });
    }
    return res.json(withStatus);
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Lỗi server" });
  }
};

export const acceptIncident = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
    }
    const incidentCaseId = parseInt(req.params.id, 10);
    if (isNaN(incidentCaseId)) {
      return res.status(400).json({ success: false, message: "id không hợp lệ" });
    }
    const { handlerKey } = req.body;
    if (!handlerKey || typeof handlerKey !== "string") {
      return res.status(400).json({ success: false, message: "handlerKey là bắt buộc" });
    }
    const caseRow = await IncidentCaseModel.findById(incidentCaseId);
    if (!caseRow) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sự cố" });
    }
    try {
      await HandlerStateModel.accept(handlerKey.trim(), incidentCaseId);
    } catch (e: any) {
      if (e.message === "HANDLER_BUSY") {
        return res.status(409).json({
          success: false,
          message: "Bạn đang xử lý sự cố khác, không thể nhận thêm.",
        });
      }
      throw e;
    }
    emitHandlerStatusChange(
      { handlerKey: handlerKey.trim(), incidentCaseId, status: "handling_this_incident" },
      caseRow.organizationId
    );
    return res.json({ success: true, message: "Đã nhận xử lý sự cố" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Lỗi server" });
  }
};

export const releaseIncident = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
    }
    const { handlerKey } = req.body;
    if (!handlerKey || typeof handlerKey !== "string") {
      return res.status(400).json({ success: false, message: "handlerKey là bắt buộc" });
    }
    const incidentCaseId = await HandlerStateModel.getCurrentIncidentCaseId(handlerKey.trim());
    await HandlerStateModel.release(handlerKey.trim());
    if (incidentCaseId != null) {
      const caseRow = await IncidentCaseModel.findById(incidentCaseId);
      if (caseRow) {
        emitHandlerStatusChange(
          { handlerKey: handlerKey.trim(), incidentCaseId: null, status: "available" },
          caseRow.organizationId
        );
      }
    }
    return res.json({ success: true, message: "Đã thôi xử lý" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Lỗi server" });
  }
};
