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
    const user = await UserModel.findById(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createUser = async (req: Request, res: Response) => {
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
  } = req.body;

  if (!email || !password)
    return res
      .status(400)
      .json({ success: false, message: "Email và password là bắt buộc" });

  try {
    const existing = await UserModel.findByEmail(email);
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });

    const user: IUser = await UserModel.create({
      name,
      email,
      password,
      phone,
      role,
      organization_id,
      department_id,
      is_department_account: is_department_account ?? false,
      is_admin_view: is_admin_view ?? false,
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
    const existingUser = await UserModel.findById(id);
    if (!existingUser)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const updateData: Partial<IUser> = { ...req.body };
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
    await UserModel.delete(id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
