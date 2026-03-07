import { Request, Response } from "express";
import { UserModel, IUser } from "../models/User";

const isSuperAdminRequest = (req: Request) => (req as any).user?.role === "SuperAdmin";

const getRequesterOrgId = async (req: Request): Promise<number | null> => {
  const currentUserId = (req as any).user?.id;
  if (!currentUserId) return null;
  const currentUser = await UserModel.findById(currentUserId);
  return currentUser?.organization_id ?? null;
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    let organizationId: number | undefined = undefined;

    if (userRole !== "SuperAdmin") {
      if (!userId) {
        return res.status(401).json({ success: false, message: "KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin ngÆ°á»i dÃ¹ng" });
      }
      const user = await UserModel.findById(userId);
      if (!user?.organization_id) {
        return res.status(403).json({ success: false, message: "User khÃ´ng thuá»™c organization nÃ o" });
      }
      organizationId = user.organization_id;
    }

    const queryOrgId = req.query.organization_id;
    if (queryOrgId && userRole === "SuperAdmin") {
      const parsed = parseInt(queryOrgId as string, 10);
      if (!isNaN(parsed)) organizationId = parsed;
    }

    const users = await UserModel.findAll(organizationId);
    res.json({ success: true, data: users });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin ngÆ°á»i dÃ¹ng" });
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "ID khÃ´ng há»£p lá»‡" });
  }

  try {
    const currentUserId = (req as any).user?.id;
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (currentUserId && (req as any).user?.role !== "SuperAdmin") {
      const currentUser = await UserModel.findById(currentUserId);

      if (
        currentUser?.organization_id &&
        user.organization_id &&
        user.organization_id !== currentUser.organization_id
      ) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n truy cáº­p user nÃ y",
        });
      }
    }

    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user?.id;
    const {
      name,
      email,
      password,
      phone,
      role,
      organization_id,
      department_id,
      is_department_account,
      is_admin_view,
      is_floor_account,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email vÃ  password lÃ  báº¯t buá»™c",
      });
    }

    const isSuperAdmin = isSuperAdminRequest(req);
    const requesterOrgId = isSuperAdmin ? null : await getRequesterOrgId(req);

    if (!isSuperAdmin && !requesterOrgId) {
      return res.status(403).json({
        success: false,
        message: "KhÃ´ng cÃ³ quyá»n táº¡o user khi chÆ°a thuá»™c organization",
      });
    }

    if (!isSuperAdmin && role === "SuperAdmin") {
      return res.status(403).json({
        success: false,
        message: "KhÃ´ng thá»ƒ táº¡o tÃ i khoáº£n SuperAdmin",
      });
    }

    if (!isSuperAdmin && organization_id !== undefined && organization_id !== null) {
      if (requesterOrgId && organization_id !== requesterOrgId) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng thá»ƒ táº¡o user cho organization khÃ¡c",
        });
      }
    }

    if (department_id) {
      const { DepartmentModel } = await import("../models/Department");
      const department = await DepartmentModel.findById(department_id);

      if (!department) {
        return res.status(400).json({
          success: false,
          message: "Department khÃ´ng tá»“n táº¡i",
        });
      }

      if (
        !isSuperAdmin &&
        requesterOrgId &&
        department.organization_id &&
        department.organization_id !== requesterOrgId
      ) {
        return res.status(403).json({
          success: false,
          message: "Department khÃ´ng thuá»™c organization cá»§a báº¡n",
        });
      }
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const finalOrgId = isSuperAdmin
      ? organization_id ?? undefined
      : requesterOrgId ?? undefined;

    const user: IUser = await UserModel.create({
      name,
      email,
      password,
      phone,
      role,
      organization_id: finalOrgId,
      department_id,
      is_department_account: is_department_account ?? false,
      is_admin_view: is_admin_view ?? false,
      is_floor_account: is_floor_account ?? false,
    });

    res.status(201).json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "ID khÃ´ng há»£p lá»‡" });
  }

  try {
    const currentUserId = (req as any).user?.id;
    const existingUser = await UserModel.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isSuperAdmin = isSuperAdminRequest(req);
    const requesterOrgId = isSuperAdmin ? null : await getRequesterOrgId(req);

    if (!isSuperAdmin) {
      if (!requesterOrgId) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n cáº­p nháº­t user khi chÆ°a thuá»™c organization",
        });
      }

      if (
        existingUser.organization_id &&
        existingUser.organization_id !== requesterOrgId
      ) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n cáº­p nháº­t user nÃ y",
        });
      }

      if (existingUser.role === "SuperAdmin" || req.body.role === "SuperAdmin") {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng thá»ƒ thao tÃ¡c vÃ i tÃ i khoáº£n SuperAdmin",
        });
      }
    }

    const { organization_id, department_id, ...restBody } = req.body;
    const updateData: Partial<IUser> = { ...restBody };

    if (organization_id !== undefined && organization_id !== null) {
      if (!isSuperAdmin && requesterOrgId && organization_id !== requesterOrgId) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng thá»ƒ thay Ä‘á»•i organization_id",
        });
      }
      updateData.organization_id = organization_id;
    }

    if (department_id !== undefined) {
      const { DepartmentModel } = await import("../models/Department");
      const department = await DepartmentModel.findById(department_id);

      if (department) {
        if (
          !isSuperAdmin &&
          requesterOrgId &&
          department.organization_id &&
          department.organization_id !== requesterOrgId
        ) {
          return res.status(403).json({
            success: false,
            message: "Department khÃ´ng thuá»™c organization cá»§a báº¡n",
          });
        }
        updateData.department_id = department_id;
      }
    }

    if (req.body.password) {
      updateData.password = req.body.password;
    }

    const updatedUser = await UserModel.update(id, updateData);
    res.json({ success: true, data: updatedUser });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "ID khÃ´ng há»£p lá»‡" });
  }

  try {
    const currentUserId = (req as any).user?.id;
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User khÃ´ng tá»“n táº¡i",
      });
    }

    const isSuperAdmin = isSuperAdminRequest(req);
    const requesterOrgId = isSuperAdmin ? null : await getRequesterOrgId(req);

    if (!isSuperAdmin) {
      if (!requesterOrgId) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n xÃ³a user khi chÆ°a thuá»™c organization",
        });
      }

      if (user.organization_id && user.organization_id !== requesterOrgId) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n xÃ³a user nÃ y",
        });
      }

      if (user.role === "SuperAdmin") {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n xÃ³a tÃ i khoáº£n SuperAdmin",
        });
      }
    }

    if (currentUserId && id === currentUserId) {
      return res.status(403).json({
        success: false,
        message: "KhÃ´ng thá»ƒ xÃ³a chÃ­nh mÃ¬nh",
      });
    }

    await UserModel.delete(id);
    res.json({ success: true, message: "User deleted" });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const unlinkUserZalo = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "ID khÃ´ng há»£p lá»‡" });
  }

  try {
    const currentUserId = (req as any).user?.id;
    const currentUserRole = (req as any).user?.role;
    if (currentUserRole !== "Admin" && currentUserRole !== "SuperAdmin") {
      return res.status(403).json({
        success: false,
        message: "Chá»‰ Admin hoáº·c SuperAdmin má»›i cÃ³ quyá»n gá»¡ liÃªn káº¿t Zalo",
      });
    }
    const existingUser = await UserModel.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (currentUserId && currentUserRole !== "SuperAdmin") {
      const currentUser = await UserModel.findById(currentUserId);

      if (
        currentUser?.organization_id &&
        existingUser.organization_id &&
        existingUser.organization_id !== currentUser.organization_id
      ) {
        return res.status(403).json({
          success: false,
          message: "KhÃ´ng cÃ³ quyá»n cáº­p nháº­t user nÃ y",
        });
      }
    }

    if (!existingUser.zalo_user_id && !existingUser.zalo_display_name) {
      return res.status(400).json({
        success: false,
        message: "TÃ i khoáº£n chÆ°a liÃªn káº¿t Zalo",
      });
    }

    const updatedUser = await UserModel.unlinkZalo(id);
    return res.json({
      success: true,
      message: "Gá»¡ liÃªn káº¿t Zalo thÃ nh cÃ´ng",
      data: updatedUser,
    });
  } catch {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
