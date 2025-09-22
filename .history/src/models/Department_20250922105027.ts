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

  static async create(dept: Partial<IDepartment>): Promise<IDepartment> {
    const { name, phone, alert_group } = dept;
    const { rows } = await pool.query(
      "INSERT INTO departments (name, phone, alert_group, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, name, phone, alert_group, created_at, updated_at",
      [name, phone, alert_group]
    );
    return rows[0];
  }

  /**
   * Cập nhật department theo ID
   */
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

  /**
   * Xoá department theo ID, kèm cascade xoá các record liên quan trong bảng history
   */
  static async delete(id: number): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Xoá các lịch sử liên quan
      await client.query(
        "DELETE FROM history WHERE department_from=$1 OR department_to=$1",
        [id]
      );

      // Xoá department
      const result = await client.query("DELETE FROM departments WHERE id=$1", [
        id,
      ]);

      await client.query("COMMIT");

      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Failed to delete department with cascade:", err);
      return false;
    } finally {
      client.release();
    }
  }
}
