import { Router } from "express";
import {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireManagementAccess } from "../middleware/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getDepartments);
router.get("/:id", authMiddleware, getDepartment);
router.post("/", authMiddleware, requireManagementAccess, createDepartment);
router.put("/:id", authMiddleware, requireManagementAccess, updateDepartment);
router.delete("/:id", authMiddleware, requireManagementAccess, deleteDepartment);

export default router;
