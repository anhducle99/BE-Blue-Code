import { pool } from "./db";

export interface IDepartment {
  id?: number;
  name: string;
  phone?: string;
  alert_group?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class DepartmentModel {
  static async findAll(): Promise<IDepartment[]> {
    const { rows } = await pool.query(
      "SELECT id, name, phone, alert_group, created_at, updated_at FROM departments ORDER BY id"
    );
    return rows;
  }

  static async findById(id: number): Promise<IDepartment | null> {
    const { rows } = await pool.query(
      "SELECT id, name, phone, alert_group, created_at, updated_at FROM departments WHERE id=$1",
      [id]
    );
    return rows[0] || null;
  }

  static async create(dept: IDepartment): Promise<IDepartment> {
    const { name, phone, alert_group } = dept;
    const { rows } = await pool.query(
      "INSERT INTO departments (name, phone, alert_group) VALUES ($1, $2, $3) RETURNING id, name, phone, alert_group, created_at, updated_at",
      [name, phone, alert_group]
    );
    return rows[0];
  }

  static async update(
    id: number,
    dept: Partial<IDepartment>
  ): Promise<IDepartment | null> {
    const { name, phone, alert_group } = dept;
    const { rows } = await pool.query(
      "UPDATE departments SET name=$1, phone=$2, alert_group=$3, updated_at=NOW() WHERE id=$4 RETURNING id, name, phone, alert_group, created_at, updated_at",
      [name, phone, alert_group, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM departments WHERE id=$1", [id]);
  }
}
