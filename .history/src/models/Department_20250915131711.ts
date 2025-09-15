import { pool } from "./db";

export interface IDepartment {
  id?: number;
  name: string;
}

export class DepartmentModel {
  static async findAll(): Promise<IDepartment[]> {
    const { rows } = await pool.query("SELECT * FROM departments ORDER BY id");
    return rows;
  }

  static async findById(id: number): Promise<IDepartment | null> {
    const { rows } = await pool.query("SELECT * FROM departments WHERE id=$1", [
      id,
    ]);
    return rows[0] || null;
  }

  static async create(name: string): Promise<IDepartment> {
    const { rows } = await pool.query(
      "INSERT INTO departments (name) VALUES ($1) RETURNING *",
      [name]
    );
    return rows[0];
  }

  static async update(id: number, name: string): Promise<IDepartment | null> {
    const { rows } = await pool.query(
      "UPDATE departments SET name=$1 WHERE id=$2 RETURNING *",
      [name, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM departments WHERE id=$1", [id]);
  }
}
