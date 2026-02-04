import { Router } from "express";
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "../controllers/organizationController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireSuperAdmin } from "../middleware/roleMiddleware";

const router = Router();

router.get("/", getOrganizations);
router.get("/:id", getOrganization);
router.post("/", authMiddleware, requireSuperAdmin, createOrganization);
router.put("/:id", updateOrganization);
router.delete("/:id", deleteOrganization);

export default router;
