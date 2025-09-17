import { Router } from "express";
import {
  getHistory,
  createHistory,
  confirmHistory,
  deleteHistory,
} from "../controllers/historyController";

const router = Router();

router.get("/", getHistory);
router.post("/", createHistory);
router.put("/:id/confirm", confirmHistory);
router.delete("/:id", deleteHistory);

export default router;
