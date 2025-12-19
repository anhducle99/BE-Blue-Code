import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";
import { prisma } from "./models/db";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  try {
    console.log("🌱 Seeding database...");

    await prisma.user.deleteMany({});
    console.log("✅ Cleared old users");

    const superadmin = await UserModel.create({
      name: "Super Admin",
      email: "superadmin@bluecode.com",
      password: "Admin@123",
      role: "SuperAdmin",
    });
    console.log("✅ Created SuperAdmin:", superadmin.email);

    const admin = await UserModel.create({
      name: "Admin Test",
      email: "admin@test.com",
      password: "123456",
      role: "Admin",
    });
    console.log("✅ Created Admin:", admin.email);

    const user = await UserModel.create({
      name: "User Test",
      email: "user@test.com",
      password: "123456",
      role: "User",
    });
    console.log("✅ Created User:", user.email);

    console.log("\n🎉 Seeding completed!");
    console.log("\n📝 Login credentials:");
    console.log("   SuperAdmin: superadmin@bluecode.com / Admin@123");
    console.log("   Admin:      admin@test.com / 123456");
    console.log("   User:       user@test.com / 123456");
  } catch (err: any) {
    console.error("❌ Seeding error:", err.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log("🔌 Database disconnected");
  }
}

seed();
