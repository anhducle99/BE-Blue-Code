import { Router } from "express";
import {
  register,
  login,
  zaloLogin,
  createQrLoginSessionController,
  getQrLoginSessionStatusController,
} from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireSuperAdmin } from "../middleware/roleMiddleware";

const router = Router();

router.post("/register", authMiddleware, requireSuperAdmin, register);
router.post("/login", login);
router.post("/zalo-login", zaloLogin);
router.post("/qr-login/session", authMiddleware, createQrLoginSessionController);
router.get("/qr-login/session/:sessionId/status", getQrLoginSessionStatusController);
// router.post("/refresh", refresh);

export default router;
