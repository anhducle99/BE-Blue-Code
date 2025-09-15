import { Request, Response } from "express";
import { OrganizationModel } from "../models/Organization";

export const getAllOrganizations = async (req: Request, res: Response) => {
  try {
    const data = await OrganizationModel.findAll();
    res.json({
      success: true,
      data,
      message: "Lấy danh sách tổ chức thành công",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getOrganizationById = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const data = await OrganizationModel.findById(id);
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Tổ chức không tồn tại" });
    res.json({ success: true, data, message: "Lấy tổ chức thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createOrganization = async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const data = await OrganizationModel.create(name);
    res
      .status(201)
      .json({ success: true, data, message: "Tạo tổ chức thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  try {
    const data = await OrganizationModel.update(id, name);
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Tổ chức không tồn tại" });
    res.json({ success: true, data, message: "Cập nhật tổ chức thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await OrganizationModel.delete(id);
    res.json({ success: true, message: "Xóa tổ chức thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
