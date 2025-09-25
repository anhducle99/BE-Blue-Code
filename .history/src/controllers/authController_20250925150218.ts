import { Request, Response } from "express";
import { UserModel } from "../models/User";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

export const register = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  try {
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email đã tồn tại" });
    }

    const user = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    res
      .status(201)
      .json({ success: true, data: user, message: "Đăng ký thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await UserModel.findByEmail(email);

    if (!user || !user.password) {
      return res
        .status(400)
        .json({ success: false, message: "Email hoặc password sai" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "Email hoặc password sai" });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({
      id: user.id,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(process.env.JWT_EXPIRES_IN || "1h")
      .sign(secret);

    res.json({
      success: true,
      data: { token, user },
      message: "Đăng nhập thành công",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
