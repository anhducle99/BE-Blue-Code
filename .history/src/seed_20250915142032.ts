import { UserModel } from "./models/User";
import { DepartmentModel } from "./models/Department";

async function seed() {
  console.log("Seeding data...");

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

seed();
