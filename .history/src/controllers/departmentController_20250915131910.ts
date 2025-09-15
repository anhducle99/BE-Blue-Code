import { Request, Response } from "express";
import { DepartmentModel } from "../models/Department";

export const getAllDepartments = async (req: Request, res: Response) => {
  try {
    const data = await DepartmentModel.findAll();
    res.json({ success: true, data, message: "Lấy danh sách thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const data = await DepartmentModel.create(name);
    res
      .status(201)
      .json({ success: true, data, message: "Tạo khoa thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
