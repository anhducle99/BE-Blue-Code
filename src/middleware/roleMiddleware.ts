import { Request, Response, NextFunction } from "express";
import { Role } from "../models/User";
import { UserModel } from "../models/User";

export const authorizeRoles = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user || !roles.includes((req as any).user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    next();
  };
};

export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!(req as any).user || (req as any).user.role !== "SuperAdmin") {
    return res.status(403).json({
      success: false,
      message: "SuperAdmin access required",
    });
  }
  next();
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userRole = (req as any).user?.role;
  if (!userRole || (userRole !== "Admin" && userRole !== "SuperAdmin")) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
};

export const requireManagementAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const jwtUser = (req as any).user;
  if (!jwtUser?.id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (jwtUser.role === "Admin" || jwtUser.role === "SuperAdmin") {
    return next();
  }

  try {
    const user = await UserModel.findById(Number(jwtUser.id));
    if (user?.is_admin_view === true) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Management access required",
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to validate management access",
    });
  }
};
