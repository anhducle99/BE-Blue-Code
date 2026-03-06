import { Request, Response } from "express";
import { DepartmentModel, IDepartment } from "../models/Department";
import { prisma } from "../models/db";

const getRequesterContext = async (req: Request) => {
  const userId = (req as any).user?.id as number | undefined;
  const userRole = (req as any).user?.role as string | undefined;
  return { userId, userRole, isSuperAdmin: userRole === "SuperAdmin" };
};

const getRequesterOrganizationId = async (req: Request): Promise<number | null> => {
  const { userId } = await getRequesterContext(req);
  if (!userId) return null;
  const { UserModel } = await import("../models/User");
  const user = await UserModel.findById(userId);
  return user?.organization_id ?? null;
};

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const { userId, userRole, isSuperAdmin } = await getRequesterContext(req);
    let organizationId: number | undefined = undefined;
    
    if (!isSuperAdmin) {
      if (!userId) {
        return res.status(401).json({ success: false, message: "Không tìm thấy thông tin người dùng" });
      }
      const requesterOrgId = await getRequesterOrganizationId(req);
      if (!requesterOrgId) {
        return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
      }
      organizationId = requesterOrgId;
    }
    
    const queryOrgId = req.query.organization_id;
    if (queryOrgId && isSuperAdmin) {
      const parsed = parseInt(queryOrgId as string);
      if (!isNaN(parsed)) organizationId = parsed;
    }
    
    const departments = await DepartmentModel.findAll(organizationId);
    res.json({ success: true, data: departments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách departments" });
  }
};

export const getDepartment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res
      .status(400)
      .json({ success: false, message: "ID department không hợp lệ" });
  }
  const dept = await DepartmentModel.findById(id);
  if (!dept)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });

  const { isSuperAdmin } = await getRequesterContext(req);
  if (!isSuperAdmin) {
    const requesterOrgId = await getRequesterOrganizationId(req);
    if (!requesterOrgId) {
      return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
    }
    if (dept.organization_id !== requesterOrgId) {
      return res.status(403).json({ success: false, message: "Không có quyền truy cập department này" });
    }
  }

  res.json({ success: true, data: dept });
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { isSuperAdmin } = await getRequesterContext(req);
    const requesterOrgId = isSuperAdmin ? null : await getRequesterOrganizationId(req);
    if (!isSuperAdmin && !requesterOrgId) {
      return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
    }

    const { name, phone, alert_group, organization_id } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên department là bắt buộc",
      });
    }

    if (!isSuperAdmin && organization_id !== undefined && organization_id !== null && Number(organization_id) !== requesterOrgId) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền tạo department cho organization khác",
      });
    }

    const finalOrganizationId =
      isSuperAdmin
        ? (organization_id !== undefined && organization_id !== null ? Number(organization_id) : undefined)
        : (requesterOrgId ?? undefined);
    
    if (finalOrganizationId !== undefined && finalOrganizationId !== null) {
      const organization = await prisma.organization.findUnique({
        where: { id: finalOrganizationId },
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
      organization_id: finalOrganizationId || undefined,
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
    const { isSuperAdmin } = await getRequesterContext(req);
    const requesterOrgId = isSuperAdmin ? null : await getRequesterOrganizationId(req);
    if (!isSuperAdmin && !requesterOrgId) {
      return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, message: "ID department không hợp lệ" });
    }
    const { name, phone, alert_group, organization_id } = req.body;
    const existingDept = await DepartmentModel.findById(id);
    if (!existingDept) {
      return res.status(404).json({
        success: false,
        message: "Department không tồn tại",
      });
    }

    if (!isSuperAdmin && existingDept.organization_id !== requesterOrgId) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền cập nhật department này",
      });
    }

    if (!isSuperAdmin && organization_id !== undefined && organization_id !== null && Number(organization_id) !== existingDept.organization_id) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền đổi organization của department",
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

  const { isSuperAdmin } = await getRequesterContext(req);
  if (!isSuperAdmin) {
    const requesterOrgId = await getRequesterOrganizationId(req);
    if (!requesterOrgId) {
      return res.status(403).json({ success: false, message: "User không thuộc organization nào" });
    }
    const dept = await DepartmentModel.findById(id);
    if (!dept) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    if (dept.organization_id !== requesterOrgId) {
      return res.status(403).json({ success: false, message: "Không có quyền xóa department này" });
    }
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
