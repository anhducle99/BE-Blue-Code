import { Request, Response } from "express";
import prisma from "../config/db";

export const getDepartments = async (req: Request, res: Response) => {
  const departments = await prisma.department.findMany();
  res.json(departments);
};

export const createDepartment = async (req: Request, res: Response) => {
  const dept = await prisma.department.create({ data: req.body });
  res.json(dept);
};

export const updateDepartment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dept = await prisma.department.update({
    where: { id: Number(id) },
    data: req.body,
  });
  res.json(dept);
};

export const deleteDepartment = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.department.delete({ where: { id: Number(id) } });
  res.json({ message: "Deleted successfully" });
};
