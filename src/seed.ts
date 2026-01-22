import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";
import { prisma } from "./models/db";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  try {
    await prisma.user.deleteMany({});
    const superadmin = await UserModel.create({
      name: "Super Admin",
      email: "superadmin@bluecode.com",
      password: "Admin@123",
      role: "SuperAdmin",
    });

    const admin = await UserModel.create({
      name: "Admin Test",
      email: "admin@test.com",
      password: "123456",
      role: "Admin",
    });

    const user = await UserModel.create({
      name: "User Test",
      email: "user@test.com",
      password: "123456",
      role: "User",
    });
  } catch (err: any) {
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
