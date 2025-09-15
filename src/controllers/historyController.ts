import { Request, Response } from "express";
import { HistoryModel } from "../models/History";

export const getAllHistory = async (req: Request, res: Response) => {
  try {
    const data = await HistoryModel.findAll();
    res.json({ success: true, data, message: "Lấy lịch sử thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createHistory = async (req: Request, res: Response) => {
  const { action } = req.body;

  // Lấy user id một cách an toàn
  const userId = (req as any).user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const data = await HistoryModel.create(action, userId);
    res
      .status(201)
      .json({ success: true, data, message: "Tạo lịch sử thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteHistory = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await HistoryModel.delete(id);
    res.json({ success: true, message: "Xóa lịch sử thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
