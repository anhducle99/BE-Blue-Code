import { Router } from "express";
import {
  getUsers,
  getMe,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  unlinkUserZalo,
} from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.get("/", authMiddleware, getUsers);
router.get("/:id", authMiddleware, getUser);
router.post("/", authMiddleware, createUser);
router.put("/:id", authMiddleware, updateUser);
router.delete("/:id/zalo-link", authMiddleware, unlinkUserZalo);
router.delete("/:id", authMiddleware, deleteUser);

export default router;
