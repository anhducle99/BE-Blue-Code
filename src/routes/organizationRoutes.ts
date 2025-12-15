import { Router } from "express";
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} from "../controllers/organizationController";

const router = Router();

router.get("/", getOrganizations);
router.get("/:id", getOrganization);
router.post("/", createOrganization);
router.put("/:id", updateOrganization);
router.delete("/:id", deleteOrganization);

export default router;
