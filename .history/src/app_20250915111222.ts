import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import deptRoutes from "./modules/department/department.routes";

const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/departments", deptRoutes);

export default app;
