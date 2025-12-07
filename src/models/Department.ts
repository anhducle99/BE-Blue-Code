import { prisma } from "./db.js";

export interface IDepartment {
  id?: number;
  name: string;
  phone?: string;
  alert_group?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class DepartmentModel {
  static async findAll(): Promise<IDepartment[]> {
    const departments = await prisma.department.findMany({
      orderBy: { id: "asc" },
    });

    return departments.map((d: any) => ({
      id: d.id,
      name: d.name,
      phone: d.phone || undefined,
      alert_group: d.alertGroup || undefined,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    }));
  }

  static async findById(id: number): Promise<IDepartment | null> {
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department) return null;

    return {
      id: department.id,
      name: department.name,
      phone: department.phone || undefined,
      alert_group: department.alertGroup || undefined,
      created_at: department.createdAt,
      updated_at: department.updatedAt,
    };
  }

  static async create(dept: Partial<IDepartment>): Promise<IDepartment> {
    const { name, phone, alert_group } = dept;

    const created = await prisma.department.create({
      data: {
        name: name!,
        phone,
        alertGroup: alert_group,
      },
    });

    return {
      id: created.id,
      name: created.name,
      phone: created.phone || undefined,
      alert_group: created.alertGroup || undefined,
      created_at: created.createdAt,
      updated_at: created.updatedAt,
    };
  }

  static async update(
    id: number,
    dept: Partial<IDepartment>
  ): Promise<IDepartment | null> {
    const { name, phone, alert_group } = dept;

    const updated = await prisma.department.update({
      where: { id },
      data: {
        name,
        phone,
        alertGroup: alert_group,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      phone: updated.phone || undefined,
      alert_group: updated.alertGroup || undefined,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    };
  }

  static async delete(id: number): Promise<boolean> {
    try {
      await prisma.history.deleteMany({
        where: {
          OR: [{ departmentFromId: id }, { departmentToId: id }],
        },
      });

      await prisma.department.delete({
        where: { id },
      });

      return true;
    } catch (err) {
      console.error("Failed to delete department with cascade:", err);
      return false;
    }
  }
}
