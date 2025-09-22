import db from "../db";

export interface IDepartment {
  id?: number;
  name: string;
  phone?: string;
  alert_group?: string;
}

export const DepartmentModel = {
  async findAll(): Promise<IDepartment[]> {
    const result = await db.query("SELECT * FROM departments ORDER BY id ASC");
    return result.rows;
  },

  async findById(id: number): Promise<IDepartment | null> {
    const result = await db.query("SELECT * FROM departments WHERE id = $1", [
      id,
    ]);
    return result.rows[0] || null;
  },

  async create(data: Partial<IDepartment>): Promise<IDepartment> {
    const result = await db.query(
      "INSERT INTO departments (name, phone, alert_group) VALUES ($1, $2, $3) RETURNING *",
      [data.name, data.phone || null, data.alert_group || null]
    );
    return result.rows[0];
  },

  async update(
    id: number,
    data: Partial<IDepartment>
  ): Promise<IDepartment | null> {
    const result = await db.query(
      "UPDATE departments SET name = $1, phone = $2, alert_group = $3 WHERE id = $4 RETURNING *",
      [data.name, data.phone || null, data.alert_group || null, id]
    );
    return result.rows[0] || null;
  },

  // 🟢 DELETE trả về true/false
  async delete(id: number): Promise<boolean> {
    const result = await db.query("DELETE FROM departments WHERE id = $1", [
      id,
    ]);
    return result.rowCount > 0; // true nếu có bản ghi bị xoá
  },
};
