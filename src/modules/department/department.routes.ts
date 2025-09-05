import { Router } from "express";
import * as departmentController from "./department.controller";

const router = Router();

router.get("/", departmentController.getDepartments);
router.get("/:id", departmentController.getDepartmentById);
router.post("/", departmentController.createDepartment);
router.put("/:id", departmentController.updateDepartment);
router.delete("/:id", departmentController.deleteDepartment);

export default router;
