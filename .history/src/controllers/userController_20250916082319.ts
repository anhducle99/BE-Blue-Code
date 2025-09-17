import { Request, Response } from "express";
import { UserModel, IUser } from "../models/User";
import bcrypt from "bcryptjs";

export const getUsers = async (req: Request, res: Response) => {
  const users = await UserModel.findAll();
  res.json({ success: true, data: users });
};

export const getUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const user = await UserModel.findById(id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: user });
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
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
  const { name, email, role } = req.body;
  const updated = await UserModel.update(id, { name, email, role });
  if (!updated)
    return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: updated });
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await UserModel.delete(id);
  res.json({ success: true, message: "User deleted" });
};
