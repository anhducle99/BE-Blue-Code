import express from "express";
import { CallLogController } from "../controllers/callLogController";

const router = express.Router();

router.post("/", CallLogController.create); // Ghi log
router.put("/:call_id/status", CallLogController.updateStatus); // Cập nhật trạng thái
router.get("/", CallLogController.getAll); // Lấy danh sách

export default router;
