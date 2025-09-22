import { Request, Response } from "express";
import { DepartmentModel, IDepartment } from "../models/Department";
import db from "../db";

export const getDepartments = async (req: Request, res: Response) => {
  const departments = await DepartmentModel.findAll();
  res.json({ success: true, data: departments });
};

export const getDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const dept = await DepartmentModel.findById(id);
  if (!dept)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.json({ success: true, data: dept });
};

export const createDepartment = async (req: Request, res: Response) => {
  const { name, phone, alert_group } = req.body;
  const dept: IDepartment = await DepartmentModel.create({
    name,
    phone,
    alert_group,
  });
  res.status(201).json({ success: true, data: dept });
};

export const updateDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { name, phone, alert_group } = req.body;
  const updated = await DepartmentModel.update(id, {
    name,
    phone,
    alert_group,
  });
  if (!updated)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.json({ success: true, data: updated });
};

// 🟢 Xoá an toàn
export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Check nếu dept còn trong history
    const historyCheck = await db.query(
      `SELECT COUNT(*) FROM history 
       WHERE department_from = $1 OR department_to = $1`,
      [id]
    );

    if (parseInt(historyCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: "Không thể xoá khoa này vì đang có lịch sử liên quan",
      });
    }

    const deleted = await DepartmentModel.delete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    res.json({ success: true, message: "Department deleted" });
  } catch (err) {
    console.error("Error deleting department:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
