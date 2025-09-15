import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, authorizeRoles("Admin"), getAllUsers);
router.get("/:id", authMiddleware, authorizeRoles("Admin"), getUserById);
router.put("/:id", authMiddleware, authorizeRoles("Admin"), updateUser);
router.delete("/:id", authMiddleware, authorizeRoles("Admin"), deleteUser);

export default router;
