import { Router } from "express";
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "../controllers/organizationController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireManagementAccess, requireSuperAdmin } from "../middleware/roleMiddleware";

const router = Router();

router.get("/", authMiddleware, getOrganizations);
router.get("/:id", authMiddleware, getOrganization);
router.post("/", authMiddleware, requireSuperAdmin, createOrganization);
router.put("/:id", authMiddleware, requireManagementAccess, updateOrganization);
router.delete("/:id", authMiddleware, requireManagementAccess, deleteOrganization);

export default router;
