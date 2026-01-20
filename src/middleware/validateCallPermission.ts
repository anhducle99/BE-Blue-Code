import { Request, Response, NextFunction } from "express";
import { UserModel } from "../models/User";

export const validateCallPermission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng"
      });
    }

    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng"
      });
    }
    if (user.is_department_account === true) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản xử lý sự cố không thể thực hiện cuộc gọi"
      });
    }

    (req as any).userFull = user;
    
    next();
  } catch (error) {
    console.error("Error validating call permission:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi validate quyền"
    });
  }
};
