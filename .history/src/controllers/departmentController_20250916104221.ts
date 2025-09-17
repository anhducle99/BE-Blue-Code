import { Request, Response } from "express";
import { DepartmentModel, IDepartment } from "../models/Department";

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
  const { name, phone, alert_group_id } = req.body;
  const dept: IDepartment = await DepartmentModel.create({
    name,
    phone,
    alert_group_id,
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

export const deleteDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await DepartmentModel.delete(id);
  res.json({ success: true, message: "Department deleted" });
};
