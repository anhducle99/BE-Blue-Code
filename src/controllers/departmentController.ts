import { Request, Response } from "express";
import { DepartmentModel, IDepartment } from "../models/Department";
import { prisma } from "../models/db";

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    let organizationId: number | undefined = undefined;
    
    if (userId) {
      const { UserModel } = await import("../models/User");
      const user = await UserModel.findById(userId);
      if (user?.organization_id) {
        organizationId = user.organization_id;
      }
    }
    
    const queryOrgId = req.query.organization_id;
    if (queryOrgId) {
      organizationId = parseInt(queryOrgId as string);
    }
    
    const departments = await DepartmentModel.findAll(organizationId);
    res.json({ success: true, data: departments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách departments" });
  }
};

export const getDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const dept = await DepartmentModel.findById(id);
  if (!dept)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.json({ success: true, data: dept });
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { name, phone, alert_group, organization_id } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên department là bắt buộc",
      });
    }
    
    if (organization_id !== undefined && organization_id !== null) {
      const organization = await prisma.organization.findUnique({
        where: { id: organization_id },
      });
      
      if (!organization) {
        return res.status(400).json({
          success: false,
          message: "Tổ chức không tồn tại",
        });
      }
    }
    
    const dept: IDepartment = await DepartmentModel.create({
      name,
      phone,
      alert_group,
      organization_id: organization_id || undefined,
    });
    
    res.status(201).json({ success: true, data: dept });
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      message: err.message || "Lỗi server khi tạo department" 
    });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, alert_group, organization_id } = req.body;
    const existingDept = await DepartmentModel.findById(id);
    if (!existingDept) {
      return res.status(404).json({
        success: false,
        message: "Department không tồn tại",
      });
    }
        
    if (organization_id !== undefined && organization_id !== null) {
      try {
        const organization = await prisma.organization.findUnique({
          where: { id: organization_id },
        });
        
        if (!organization) {
          return res.status(400).json({
            success: false,
            message: "Tổ chức không tồn tại",
          });
        }
      } catch (orgErr: any) {
        if (!orgErr.message?.includes('organization')) {
          throw orgErr;
        }
      }
    }
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (alert_group !== undefined) updateData.alert_group = alert_group;
    if (organization_id !== undefined) {
      updateData.organization_id = organization_id;
    }
       
    const updated = await DepartmentModel.update(id, updateData);
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Department không tồn tại",
      });
    }
    
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Lỗi server khi cập nhật department",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid department ID" });
  }

  const deleted = await DepartmentModel.delete(id);

  if (!deleted) {
    return res.status(400).json({
      success: false,
      message:
        "Department not found or cannot be deleted (maybe linked in history)",
    });
  }

  res.json({ success: true, message: "Department deleted" });
};
