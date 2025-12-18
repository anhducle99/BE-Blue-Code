import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { UserModel } from "../models/User";
import { SignJWT } from "jose";

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin đăng ký",
      });
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email đã tồn tại",
      });
    }

    // ✅ HASH PASSWORD (QUAN TRỌNG NHẤT)
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    return res.status(201).json({
      success: true,
      data: user,
      message: "Đăng ký thành công",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

/**
 * LOGIN
 * - So sánh bcrypt đúng cách
 * - Trả JWT
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu email hoặc password",
      });
    }

    const user = await UserModel.findByEmail(email);

    if (!user || !user.password) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc password sai",
      });
    }

    // ✅ SO SÁNH PASSWORD ĐÚNG
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc password sai",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    // ✅ TẠO JWT
    const token = await new SignJWT({
      id: user.id,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(process.env.JWT_EXPIRES_IN || "1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    return res.json({
      success: true,
      data: {
        token,
        user,
      },
      message: "Đăng nhập thành công",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};
