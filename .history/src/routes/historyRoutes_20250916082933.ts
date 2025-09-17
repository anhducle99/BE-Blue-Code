import { Router } from "express";
import { getHistory, createHistory } from "../controllers/historyController";

const router = Router();

router.get("/", getHistory);
router.post("/", createHistory);

export default router;
