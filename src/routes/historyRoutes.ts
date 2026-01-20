import express from "express";
import { getCallHistory } from "../controllers/historyController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();
router.get("/", authMiddleware, getCallHistory);

export default router;
