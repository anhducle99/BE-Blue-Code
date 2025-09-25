// models/User.ts
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

    // ✅ chỉ hash ở đây
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
}
