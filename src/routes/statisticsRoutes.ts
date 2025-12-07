import { Router } from "express";
import {
  getDepartmentStats,
  getGroupStats,
} from "../controllers/statisticsController.js";

const router = Router();

router.get("/departments", getDepartmentStats);
router.get("/groups", getGroupStats);

export default router;
