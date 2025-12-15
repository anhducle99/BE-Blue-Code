import { prisma } from "./models/db";
import bcrypt from "bcrypt";

async function resetAdmin() {
  const email = "admin@example.com";
  const plainPassword = "123456";

  try {
    await prisma.user.deleteMany({
      where: { email },
    });

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const admin = await prisma.user.create({
      data: {
        name: "Admin",
        email,
        password: hashedPassword,
        role: "Admin",
      },
    });
  } catch (err) {
    console.error("❌ Lỗi khi reset admin:", err);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdmin();
