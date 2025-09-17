import { pool } from "./db";

export type Role = "Admin" | "User" | "SuperAdmin";

export interface IUser {
  id?: number;
  name: string;
  email: string;
  password?: string;
  role: Role;
}

export class UserModel {
  static async findAll(): Promise<IUser[]> {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, created_at, updated_at FROM users"
    );
    return rows;
  }

  static async findById(id: number): Promise<IUser | null> {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, created_at, updated_at FROM users WHERE id=$1",
      [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email: string): Promise<IUser | null> {
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);
    return rows[0] || null;
  }

  static async create(user: IUser): Promise<IUser> {
    const { name, email, password, role } = user;
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, updated_at",
      [name, email, password, role]
    );
    return rows[0];
  }

  static async update(id: number, user: Partial<IUser>): Promise<IUser | null> {
    const { name, email, role } = user;
    const { rows } = await pool.query(
      "UPDATE users SET name=$1, email=$2, role=$3, updated_at=NOW() WHERE id=$4 RETURNING id, name, email, role, created_at, updated_at",
      [name, email, role, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
  }
}
