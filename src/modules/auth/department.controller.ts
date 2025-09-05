import { Request, Response } from "express";
import prisma from "../../config/db";

export const getDepts = async (_: Request, res: Response) => {
  const depts = await prisma.department.findMany();
  res.json(depts);
};

export const createDept = async (req: Request, res: Response) => {
  const dept = await prisma.department.create({ data: req.body });
  res.json(dept);
};

export const updateDept = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dept = await prisma.department.update({
    where: { id: Number(id) },
    data: req.body,
  });
  res.json(dept);
};

export const deleteDept = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.department.delete({ where: { id: Number(id) } });
  res.json({ message: "Deleted successfully" });
};
