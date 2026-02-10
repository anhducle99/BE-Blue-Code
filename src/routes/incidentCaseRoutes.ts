import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getIncidentCases, acceptIncident, releaseIncident } from "../controllers/incidentCaseController";

const router = Router();

router.get("/", authMiddleware, getIncidentCases);
router.post("/:id/accept", authMiddleware, acceptIncident);
router.post("/release", authMiddleware, releaseIncident);

export default router;
