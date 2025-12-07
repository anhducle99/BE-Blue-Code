import express from "express";
import { getCallHistory } from "../controllers/historyController.js";

const router = express.Router();
router.get("/", getCallHistory);

export default router;
