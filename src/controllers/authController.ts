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

    const user = await UserModel.create({
      name,
      email,
      password,
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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu email hoặc password",
      });
    }

    const user = await UserModel.findByEmail(email, true);

    if (!user || !user.password) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc password sai",
      });
    }

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

    const token = await new SignJWT({
      id: user.id,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(process.env.JWT_EXPIRES_IN || "1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const userForResponse = await UserModel.findByEmail(email, false);
    if (!userForResponse) {
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy thông tin user",
      });
    }

    const userResponse = {
      id: userForResponse.id,
      name: userForResponse.name,
      email: userForResponse.email,
      phone: userForResponse.phone,
      role: userForResponse.role,
      department_id: userForResponse.department_id,
      department_name: userForResponse.department_name,
      organization_id: userForResponse.organization_id,
      organization_name: userForResponse.organization_name,
      is_department_account: userForResponse.is_department_account,
      is_admin_view: userForResponse.is_admin_view,
      created_at: userForResponse.created_at,
      updated_at: userForResponse.updated_at,
    };

    return res.json({
      success: true,
      data: {
        token,
        user: userResponse,
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
