import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getDepartments = async () => {
  return prisma.department.findMany();
};

export const getDepartmentById = async (id: number) => {
  return prisma.department.findUnique({ where: { id } });
};

export const createDepartment = async (data: {
  name: string;
  phone?: string;
  group: string;
}) => {
  return prisma.department.create({ data });
};

export const updateDepartment = async (
  id: number,
  data: { name?: string; phone?: string; group?: string }
) => {
  return prisma.department.update({ where: { id }, data });
};

export const deleteDepartment = async (id: number) => {
  return prisma.department.delete({ where: { id } });
};
