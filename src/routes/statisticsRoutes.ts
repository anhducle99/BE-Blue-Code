import { Router } from "express";
import {
  getDepartmentStats,
  getGroupStats,
} from "../controllers/statisticsController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/departments", authMiddleware, getDepartmentStats);
router.get("/groups", authMiddleware, getGroupStats);

export default router;
