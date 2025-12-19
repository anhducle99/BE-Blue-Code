import { Request, Response, NextFunction } from "express";
import { Role } from "../models/User";

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
