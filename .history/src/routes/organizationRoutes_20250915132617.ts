import { Router } from "express";
import {
  getAllOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "../controllers/organizationController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { authorizeRoles } from "../middlewares/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getAllOrganizations);
router.get("/:id", authMiddleware, getOrganizationById);
router.post("/", authMiddleware, authorizeRoles("Admin"), createOrganization);
router.put("/:id", authMiddleware, authorizeRoles("Admin"), updateOrganization);
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("Admin"),
  deleteOrganization
);

export default router;
