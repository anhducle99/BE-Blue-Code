import pool from "./db"; // hoặc client connect DB trực tiếp
import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";

async function seed() {
  console.log("Seeding data...");

  // Reset dữ liệu (chỉ dùng dev, cẩn thận production!)
  await pool.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE TABLE departments RESTART IDENTITY CASCADE");

  await DepartmentModel.create("Khoa CNTT");
  await DepartmentModel.create("Khoa Điện");

  await UserModel.create({
    name: "Admin",
    email: "admin@test.com",
    password: "123456",
    role: "Admin",
  });
  await UserModel.create({
    name: "User",
    email: "user@test.com",
    password: "123456",
    role: "User",
  });

  console.log("Seeding done");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
