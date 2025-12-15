import { prisma } from "./db";
import bcrypt from "bcrypt";

export type Role = "Admin" | "User";

export interface IUser {
  id?: number;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role?: Role;
  department_id?: number;
  organization_id?: number;
  department_name?: string;
  organization_name?: string;
  is_department_account?: boolean;
  is_admin_view?: boolean;
  created_at?: Date;
  updated_at?: Date;
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

    return users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password || undefined,
      phone: u.phone || undefined,
      role: u.role as Role,
      department_id: u.departmentId || undefined,
      organization_id: u.organizationId || undefined,
      department_name: u.department?.name,
      organization_name: u.organization?.name,
      is_department_account: u.isDepartmentAccount,
      is_admin_view: u.isAdminView,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    }));
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

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password || undefined,
      phone: user.phone || undefined,
      role: user.role as Role,
      department_id: user.departmentId || undefined,
      organization_id: user.organizationId || undefined,
      department_name: user.department?.name,
      organization_name: user.organization?.name,
      is_department_account: user.isDepartmentAccount,
      is_admin_view: user.isAdminView,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  static async findByEmail(email: string): Promise<IUser | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password || undefined,
      phone: user.phone || undefined,
      role: user.role as Role,
      department_id: user.departmentId || undefined,
      organization_id: user.organizationId || undefined,
      department_name: user.department?.name,
      organization_name: user.organization?.name,
      is_department_account: user.isDepartmentAccount,
      is_admin_view: user.isAdminView,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
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

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      password: created.password || undefined,
      phone: created.phone || undefined,
      role: created.role as Role,
      department_id: created.departmentId || undefined,
      organization_id: created.organizationId || undefined,
      department_name: created.department?.name,
      organization_name: created.organization?.name,
      is_department_account: created.isDepartmentAccount,
      is_admin_view: created.isAdminView,
      created_at: created.createdAt,
      updated_at: created.updatedAt,
    };
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

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      password: updated.password || undefined,
      phone: updated.phone || undefined,
      role: updated.role as Role,
      department_id: updated.departmentId || undefined,
      organization_id: updated.organizationId || undefined,
      department_name: updated.department?.name,
      organization_name: updated.organization?.name,
      is_department_account: updated.isDepartmentAccount,
      is_admin_view: updated.isAdminView,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    };
  }

  static async delete(id: number): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
