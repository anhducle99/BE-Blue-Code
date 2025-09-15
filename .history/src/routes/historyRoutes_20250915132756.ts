import { Router } from "express";
import {
  getAllHistory,
  createHistory,
  deleteHistory,
} from "../controllers/historyController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { authorizeRoles } from "../middlewares/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getAllHistory);
router.post("/", authMiddleware, createHistory);
router.delete("/:id", authMiddleware, authorizeRoles("Admin"), deleteHistory);

export default router;
