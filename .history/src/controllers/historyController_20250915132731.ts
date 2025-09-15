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
  try {
    const data = await HistoryModel.create(action, req.user!.id);
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
