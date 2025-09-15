import { Request, Response } from "express";
import { UserModel } from "../models/User";

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const data = await UserModel.findAll();
    res.json({
      success: true,
      data,
      message: "Lấy danh sách người dùng thành công",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const data = await UserModel.findById(id);
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    res.json({ success: true, data, message: "Lấy người dùng thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, email, role } = req.body;
  try {
    const data = await UserModel.update(id, { name, email, role });
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    res.json({
      success: true,
      data,
      message: "Cập nhật người dùng thành công",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await UserModel.delete(id);
    res.json({ success: true, message: "Xóa người dùng thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
