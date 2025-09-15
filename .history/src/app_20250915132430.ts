import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import departmentRoutes from "./routes/departmentRoutes";

dotenv.config();
const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);

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
