import { Request, Response } from "express";
import bcrypt from "bcrypt";
import axios from "axios";
import { UserModel } from "../models/User";
import { prisma } from "../models/db";
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
      is_floor_account: userForResponse.is_floor_account,
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

export const zaloLogin = async (req: Request, res: Response) => {
  try {
    const { accessToken, code, codeVerifier } = req.body;

    if (!accessToken && !code) {
      return res.status(400).json({
        success: false,
        message: "Thiếu accessToken hoặc code",
      });
    }

    let zaloUserId: string;
    let zaloUserInfo: any;

    try {
      let finalAccessToken = accessToken;

      if (!finalAccessToken && code) {
        const tokenRes = await axios.post(
          "https://oauth.zaloapp.com/v4/access_token",
          {
            app_id: process.env.ZALO_APP_ID,
            code,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
          },
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              secret_key: process.env.ZALO_APP_SECRET,
            },
          }
        );
        finalAccessToken = tokenRes.data.access_token;
      }

      const profileRes = await axios.get(
        "https://graph.zalo.me/v2.0/me?fields=id,name,picture",
        {
          headers: {
            access_token: finalAccessToken,
          },
        }
      );

      if (profileRes.data.error) {
        throw new Error(profileRes.data.error.message);
      }

      zaloUserId = profileRes.data.id;
      zaloUserInfo = profileRes.data;
    } catch (error: any) {
      console.error("[ZaloLogin] Zalo API error:", error.response?.data || error.message);

      if (process.env.NODE_ENV === "development" && req.body.mockMode) {
        zaloUserId = req.body.mockZaloUserId || "mock_zalo_user_123";
        zaloUserInfo = { id: zaloUserId, name: "Mock User" };
        console.log("[ZaloLogin] Using mock mode with zaloUserId:", zaloUserId);
      } else {
        return res.status(401).json({
          success: false,
          message: "Invalid Zalo access token",
          error: error.message,
        });
      }
    }

    const user = await prisma.user.findFirst({
      where: {
        zaloUserId: zaloUserId,
        zaloVerified: true,
      },
      include: {
        department: true,
        organization: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Tài khoản chưa được liên kết với Zalo. Vui lòng liên kết trước trong ứng dụng web.",
        code: "NOT_LINKED",
        zaloUserId: zaloUserId,
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    const token = await new SignJWT({
      id: user.id,
      role: user.role,
      zaloUserId: user.zaloUserId,
      type: "zalo_mini_app",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      department_id: user.departmentId,
      department_name: user.department?.name,
      organization_id: user.organizationId,
      organization_name: user.organization?.name,
      zaloUserId: user.zaloUserId,
    };

    return res.json({
      success: true,
      message: "Đăng nhập Zalo thành công",
      data: {
        token,
        user: userResponse,
        zaloUserInfo: {
          id: zaloUserInfo.id,
          name: zaloUserInfo.name,
          picture: zaloUserInfo.picture,
        },
      },
    });
  } catch (err: any) {
    console.error("[ZaloLogin] Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};
