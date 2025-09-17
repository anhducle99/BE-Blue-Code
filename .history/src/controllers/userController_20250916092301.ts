import { Request, Response } from "express";
import { UserModel, IUser } from "../models/User";
import bcrypt from "bcryptjs";

export const getUsers = async (req: Request, res: Response) => {
  const users = await UserModel.findAll();
  res.json({ success: true, data: users });
};

export const getUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  const user = await UserModel.findById(id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  res.json({ success: true, data: user });
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  if (!email || !password)
    return res
      .status(400)
      .json({ success: false, message: "Email và password là bắt buộc" });

  const existing = await UserModel.findByEmail(email);
  if (existing)
    return res
      .status(400)
      .json({ success: false, message: "Email already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user: IUser = await UserModel.create({
    name,
    email,
    password: hashedPassword,
    role,
  });

  res.status(201).json({ success: true, data: user });
};

export const updateUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  const existingUser = await UserModel.findById(id);
  if (!existingUser)
    return res.status(404).json({ success: false, message: "User not found" });

  // Chỉ update những trường được gửi, giữ nguyên nếu không có
  const updateData: Partial<IUser> = {
    name: req.body.name ?? existingUser.name,
    email: req.body.email ?? existingUser.email,
    role: req.body.role ?? existingUser.role,
  };

  // Nếu gửi password mới, hash nó
  if (req.body.password) {
    updateData.password = await bcrypt.hash(req.body.password, 10);
  }

  const updatedUser = await UserModel.update(id, updateData);
  res.json({ success: true, data: updatedUser });
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  await UserModel.delete(id);
  res.json({ success: true, message: "User deleted" });
};
