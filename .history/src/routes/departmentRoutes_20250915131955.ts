import { Router } from "express";
import {
  getAllDepartments,
  createDepartment,
} from "../controllers/departmentController";
import { authMiddleware } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getAllDepartments);
router.post("/", authMiddleware, authorizeRoles("Admin"), createDepartment);

export default router;
