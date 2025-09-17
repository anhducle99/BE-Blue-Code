import { Request, Response } from "express";
import { HistoryModel, IHistory } from "../models/HistoryModel";

export const getHistory = async (req: Request, res: Response) => {
  try {
    const data = await HistoryModel.findAll();
    res.json({ success: true, data, message: "Lấy lịch sử thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createHistory = async (req: Request, res: Response) => {
  try {
    const history: IHistory = req.body;
    const data = await HistoryModel.create(history);
    res
      .status(201)
      .json({ success: true, data, message: "Tạo thông báo thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const confirmHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'confirmed' | 'rejected'
    const data = await HistoryModel.updateStatus(Number(id), status);
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy thông báo" });
    res.json({
      success: true,
      data,
      message: "Cập nhật trạng thái thành công",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await HistoryModel.delete(Number(id));
    res.json({ success: true, message: "Xóa thông báo thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
