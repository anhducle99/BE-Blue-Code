import { prisma } from "./db";
import bcrypt from "bcrypt";

export type Role = "SuperAdmin" | "Admin" | "User";

export interface IUser {
  id?: number;
  name: string;
  email: string;
  password?: string;
  phone?: string | null;
  role?: Role;
  department_id?: number | null;
  organization_id?: number | null;
  department_name?: string | null;
  organization_name?: string | null;
  is_department_account?: boolean;
  is_admin_view?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Helper function to sanitize user object - removes password and ensures all fields are present
 */
function sanitizeUser(user: any, includePassword: boolean = false): IUser {
  const sanitized: IUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role as Role,
    department_id: user.departmentId ?? null,
    organization_id: user.organizationId ?? null,
    department_name: user.department?.name ?? null,
    organization_name: user.organization?.name ?? null,
    is_department_account: user.isDepartmentAccount ?? false,
    is_admin_view: user.isAdminView ?? false,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };

  // Only include password if explicitly requested (for internal use like login verification)
  if (includePassword && user.password) {
    sanitized.password = user.password;
  }

  return sanitized;
}

export class UserModel {
  static async findAll(): Promise<IUser[]> {
    const users = await prisma.user.findMany({
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });

    return users.map((u: any) => sanitizeUser(u, false));
  }

  static async findById(id: number): Promise<IUser | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    if (!user) return null;

    return sanitizeUser(user, false);
  }

  static async findByEmail(
    email: string,
    includePassword: boolean = false
  ): Promise<IUser | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    if (!user) return null;

    return sanitizeUser(user, includePassword);
  }

  static async create(user: IUser): Promise<IUser> {
    const {
      name,
      email,
      password,
      phone,
      role = "User",
      department_id,
      organization_id,
      is_department_account = false,
      is_admin_view = false,
    } = user;

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        role,
        departmentId: department_id,
        organizationId: organization_id,
        isDepartmentAccount: is_department_account,
        isAdminView: is_admin_view,
      },
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    return sanitizeUser(created, false);
  }

  static async update(id: number, user: Partial<IUser>): Promise<IUser | null> {
    const updateData: any = {};

    if (user.name !== undefined) updateData.name = user.name;
    if (user.email !== undefined) updateData.email = user.email;
    if (user.phone !== undefined) updateData.phone = user.phone;
    if (user.role !== undefined) updateData.role = user.role;
    if (user.department_id !== undefined)
      updateData.departmentId = user.department_id;
    if (user.organization_id !== undefined)
      updateData.organizationId = user.organization_id;
    if (user.is_department_account !== undefined)
      updateData.isDepartmentAccount = user.is_department_account;
    if (user.is_admin_view !== undefined)
      updateData.isAdminView = user.is_admin_view;

    if (user.password) {
      updateData.password = await bcrypt.hash(user.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    return sanitizeUser(updated, false);
  }

  static async delete(id: number): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
