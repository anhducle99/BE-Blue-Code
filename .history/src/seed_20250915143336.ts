import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding data...");

  await DepartmentModel.create("Khoa CNTT");
  await DepartmentModel.create("Khoa Điện");

  const hashedAdminPass = await bcrypt.hash("123456", 10);
  const hashedUserPass = await bcrypt.hash("123456", 10);

  await UserModel.create({
    name: "Admin",
    email: "admin@test.com",
    password: hashedAdminPass,
    role: "Admin",
  });

  await UserModel.create({
    name: "User",
    email: "user@test.com",
    password: hashedUserPass,
    role: "User",
  });

  console.log("Seeding done");
}

seed();
