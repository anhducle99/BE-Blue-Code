import { Router } from "express";
import {
  getAllDepartments,
  createDepartment,
} from "../controllers/departmentController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { authorizeRoles } from "../middlewares/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getAllDepartments);
router.post("/", authMiddleware, authorizeRoles("Admin"), createDepartment);

export default router;
