import { Router } from "express";
import { login, register, refreshToken } from "./auth.controller";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);

export default router;
