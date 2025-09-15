import express from "express";
import dotenv from "dotenv";
import departmentRoutes from "./routes/departmentRoutes";

dotenv.config();
const app = express();

app.use(express.json());

// Routes
app.use("/api/departments", departmentRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/organizations", organizationRoutes);
// app.use("/api/history", historyRoutes);

// Error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
);

export default app;
