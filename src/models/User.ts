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
  is_floor_account?: boolean;
  zalo_user_id?: string | null;
  zalo_display_name?: string | null;
  zalo_verified?: boolean;
  zalo_linked_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

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
    is_floor_account: user.isFloorAccount ?? false,
    zalo_user_id: user.zaloUserId ?? null,
    zalo_display_name: user.zaloDisplayName ?? null,
    zalo_verified: user.zaloVerified ?? false,
    zalo_linked_at: user.zaloLinkedAt ?? null,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };

  if (includePassword && user.password) {
    sanitized.password = user.password;
  }

  return sanitized;
}

export class UserModel {
  static async findAll(organizationId?: number): Promise<IUser[]> {
    const where: any = {};
    
    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
      orderBy: { id: "desc" },
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

  /** Single-query lookup by name (e.g. socket register fallback). Uses case-insensitive match. */
  static async findByName(name: string): Promise<IUser | null> {
    if (!name || typeof name !== "string" || !name.trim()) return null;
    const user = await prisma.user.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" } },
      include: {
        department: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!user) return null;
    return sanitizeUser(user, false);
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
      is_floor_account = false,
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
        isFloorAccount: is_floor_account ?? false,
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
    if (user.is_floor_account !== undefined)
      updateData.isFloorAccount = user.is_floor_account;
    if (user.zalo_user_id !== undefined)
      updateData.zaloUserId = user.zalo_user_id;
    if (user.zalo_display_name !== undefined)
      updateData.zaloDisplayName = user.zalo_display_name;
    if (user.zalo_verified !== undefined)
      updateData.zaloVerified = user.zalo_verified;
    if (user.zalo_linked_at !== undefined)
      updateData.zaloLinkedAt = user.zalo_linked_at;

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

  static async unlinkZalo(id: number): Promise<IUser> {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        zaloUserId: null,
        zaloDisplayName: null,
        zaloVerified: false,
        zaloLinkedAt: null,
      },
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
