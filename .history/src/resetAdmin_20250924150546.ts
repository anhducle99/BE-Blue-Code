import { pool } from "./models/db";
import bcrypt from "bcryptjs";

async function resetAdmin() {
  const email = "admin@example.com";
  const plainPassword = "123456";

  try {
    console.log("🚀 Resetting admin account...");

    // 1️⃣ Xóa user cũ nếu tồn tại
    await pool.query("DELETE FROM users WHERE email=$1", [email]);
    console.log(`✅ User cũ xóa thành công: ${email}`);

    // 2️⃣ Hash password mới bằng bcryptjs
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log("🔐 Password mới được hash:", hashedPassword);

    // 3️⃣ Insert admin mới
    const query = `
      INSERT INTO users (name, email, password, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, name, email, role, password;
    `;
    const values = ["Admin", email, hashedPassword, "Admin"];
    const res = await pool.query(query, values);

    console.log("✅ Admin mới đã được tạo:");
    console.table(res.rows);

    console.log("🎯 Giờ bạn có thể test login trên Postman với:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${plainPassword}`);
  } catch (err) {
    console.error("❌ Lỗi khi reset admin:", err);
  } finally {
    await pool.end();
  }
}

resetAdmin();
