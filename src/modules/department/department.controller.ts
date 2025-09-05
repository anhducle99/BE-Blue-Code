import { Request, Response } from "express";
import * as departmentService from "./department.service";

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const depts = await departmentService.getDepartments();
    res.json(depts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDepartmentById = async (req: Request, res: Response) => {
  try {
    const dept = await departmentService.getDepartmentById(
      Number(req.params.id)
    );
    if (!dept) return res.status(404).json({ message: "Not found" });
    res.json(dept);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const dept = await departmentService.createDepartment(req.body);
    res.status(201).json(dept);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const dept = await departmentService.updateDepartment(
      Number(req.params.id),
      req.body
    );
    res.json(dept);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    await departmentService.deleteDepartment(Number(req.params.id));
    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
