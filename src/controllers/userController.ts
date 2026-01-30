import { Request, Response } from "express";
import { UserModel, IUser } from "../models/User";
import bcrypt from "bcrypt";

export const getUsers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    let organizationId: number | undefined = undefined;

    if (userId) {
      const user = await UserModel.findById(userId);
      if (user?.organization_id) {
        organizationId = user.organization_id;
      }
    }

    const queryOrgId = req.query.organization_id;
    if (queryOrgId) {
      organizationId = parseInt(queryOrgId as string);
    }

    const users = await UserModel.findAll(organizationId);
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  try {
    const currentUserId = (req as any).user?.id;
    const user = await UserModel.findById(id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (currentUserId) {
      const currentUser = await UserModel.findById(currentUserId);
      
      if (currentUser?.organization_id && user.organization_id && 
          user.organization_id !== currentUser.organization_id) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền truy cập user này"
        });
      }
    }

    res.json({ success: true, data: user });
  } catch (err) {
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
        message: "Email và password là bắt buộc" 
      });
    }

    let userOrganizationId: number | undefined = undefined;
    if (currentUserId) {
      const currentUser = await UserModel.findById(currentUserId);
      if (currentUser?.organization_id) {
        userOrganizationId = currentUser.organization_id;
      }
    }

    if (organization_id !== undefined && organization_id !== null) {
      if (userOrganizationId && organization_id !== userOrganizationId) {
        return res.status(403).json({
          success: false,
          message: "Không thể tạo user cho organization khác"
        });
      }
    }

    if (department_id) {
      const { DepartmentModel } = await import("../models/Department");
      const department = await DepartmentModel.findById(department_id);
      
      if (!department) {
        return res.status(400).json({
          success: false,
          message: "Department không tồn tại"
        });
      }

      if (userOrganizationId && department.organization_id && 
          department.organization_id !== userOrganizationId) {
        return res.status(403).json({
          success: false,
          message: "Department không thuộc organization của bạn"
        });
      }
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "Email already exists" 
      });
    }

    const finalOrgId = userOrganizationId || organization_id || undefined;

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
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  try {
    const currentUserId = (req as any).user?.id;
    const existingUser = await UserModel.findById(id);
    
    if (!existingUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (currentUserId) {
      const currentUser = await UserModel.findById(currentUserId);
      
      if (currentUser?.organization_id && existingUser.organization_id && 
          existingUser.organization_id !== currentUser.organization_id) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền cập nhật user này"
        });
      }
    }

    const { organization_id, department_id, ...restBody } = req.body;
    const updateData: Partial<IUser> = { ...restBody };

    if (organization_id !== undefined && organization_id !== null) {
      if (currentUserId) {
        const currentUser = await UserModel.findById(currentUserId);
        
        if (currentUser?.organization_id && organization_id !== currentUser.organization_id) {
          return res.status(403).json({
            success: false,
            message: "Không thể thay đổi organization_id"
          });
        }
      }
      updateData.organization_id = organization_id;
    }

    if (department_id !== undefined) {
      const { DepartmentModel } = await import("../models/Department");
      const department = await DepartmentModel.findById(department_id);
      
      if (department) {
        if (currentUserId) {
          const currentUser = await UserModel.findById(currentUserId);
          
          if (currentUser?.organization_id && department.organization_id && 
              department.organization_id !== currentUser.organization_id) {
            return res.status(403).json({
              success: false,
              message: "Department không thuộc organization của bạn"
            });
          }
        }
        updateData.department_id = department_id;
      }
    }

    if (req.body.password) {
      updateData.password = await bcrypt.hash(req.body.password, 10);
    }

    const updatedUser = await UserModel.update(id, updateData);
    res.json({ success: true, data: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  try {
    const currentUserId = (req as any).user?.id;
    const user = await UserModel.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User không tồn tại"
      });
    }

    if (currentUserId) {
      const currentUser = await UserModel.findById(currentUserId);
      
      if (currentUser?.organization_id && user.organization_id && 
          user.organization_id !== currentUser.organization_id) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền xóa user này"
        });
      }

      if (id === currentUserId) {
        return res.status(403).json({
          success: false,
          message: "Không thể xóa chính mình"
        });
      }
    }

    await UserModel.delete(id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
