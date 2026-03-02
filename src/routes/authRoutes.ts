import { Router } from "express";
import { register, login, zaloLogin } from "../controllers/authController";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/zalo-login", zaloLogin);
// router.post("/refresh", refresh);

export default router;
