import { pool } from "./db";
import bcrypt from "bcryptjs";

export type Role = "Admin" | "User";

export interface IUser {
  id?: number;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role?: Role;
  department_id?: number;
  organization_id?: number;
  department_name?: string;
  organization_name?: string;
  is_department_account?: boolean;
  is_admin_view?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class UserModel {
  // Lấy tất cả user (kèm tên khoa & tổ chức)
  static async findAll(): Promise<IUser[]> {
    const { rows } = await pool.query(`
      SELECT 
        u.*, 
        d.name AS department_name, 
        o.name AS organization_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN organizations o ON u.organization_id = o.id
      ORDER BY u.id
    `);
    return rows;
  }

  // Lấy user theo id
  static async findById(id: number): Promise<IUser | null> {
    const { rows } = await pool.query(
      `
      SELECT 
        u.*, 
        d.name AS department_name, 
        o.name AS organization_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id=$1
      `,
      [id]
    );
    return rows[0] || null;
  }

  // Lấy user theo email
  static async findByEmail(email: string): Promise<IUser | null> {
    const { rows } = await pool.query(
      `
      SELECT 
        u.*, 
        d.name AS department_name, 
        o.name AS organization_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.email=$1
      `,
      [email]
    );
    return rows[0] || null;
  }

  // Tạo user
  static async create(user: IUser): Promise<IUser> {
    const {
      name,
      email,
      password,
      phone,
      role = "User",
      department_id,
      organization_id,
      is_department_account = false,
      is_admin_view = false,
    } = user;

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await pool.query(
      `
      INSERT INTO users 
        (name, email, password, phone, role, department_id, organization_id, is_department_account, is_admin_view)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        name,
        email,
        hashedPassword,
        phone,
        role,
        department_id,
        organization_id,
        is_department_account,
        is_admin_view,
      ]
    );

    return rows[0];
  }

  // Cập nhật user
  static async update(id: number, user: Partial<IUser>): Promise<IUser | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of [
      "name",
      "email",
      "phone",
      "password",
      "role",
      "department_id",
      "organization_id",
      "is_department_account",
      "is_admin_view",
    ] as const) {
      if (user[key] !== undefined) {
        if (key === "password" && user.password) {
          const hash = await bcrypt.hash(user.password, 10);
          fields.push(`${key}=$${idx++}`);
          values.push(hash);
        } else if (key !== "password") {
          fields.push(`${key}=$${idx++}`);
          values.push(user[key]);
        }
      }
    }

    fields.push(`updated_at=NOW()`);

    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id=$${idx} RETURNING *`,
      [...values, id]
    );

    return rows[0] || null;
  }

  // Xóa user
  static async delete(id: number): Promise<void> {
    await pool.query(`DELETE FROM users WHERE id=$1`, [id]);
  }
}
