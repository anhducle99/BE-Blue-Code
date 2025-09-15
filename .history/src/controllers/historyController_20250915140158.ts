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

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Không có token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token không hợp lệ" });
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
