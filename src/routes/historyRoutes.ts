import express from "express";
import { getCallHistory } from "../controllers/historyController";

const router = express.Router();
router.get("/", getCallHistory);

export default router;
