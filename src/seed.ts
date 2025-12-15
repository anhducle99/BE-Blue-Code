import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";
import { prisma } from "./models/db";
import bcrypt from "bcrypt";

async function seed() {
  try {
    const hashedAdminPass = await bcrypt.hash("123456", 10);
    const hashedUserPass = await bcrypt.hash("123456", 10);

    const admin = await UserModel.create({
      name: "Admin",
      email: "admin@test.com",
      password: hashedAdminPass,
      role: "Admin",
    });

    const user = await UserModel.create({
      name: "User",
      email: "user@test.com",
      password: hashedUserPass,
      role: "User",
    });
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
