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
import { requireManagementAccess } from "../middleware/roleMiddleware";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.get("/", authMiddleware, getUsers);
router.get("/:id", authMiddleware, getUser);
router.post("/", authMiddleware, requireManagementAccess, createUser);
router.put("/:id", authMiddleware, requireManagementAccess, updateUser);
router.delete("/:id/zalo-link", authMiddleware, requireManagementAccess, unlinkUserZalo);
router.delete("/:id", authMiddleware, requireManagementAccess, deleteUser);

export default router;
