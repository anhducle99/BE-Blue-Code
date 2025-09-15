import { pool } from "./db";

export interface IOrganization {
  id?: number;
  name: string;
}

export class OrganizationModel {
  static async findAll(): Promise<IOrganization[]> {
    const { rows } = await pool.query(
      "SELECT * FROM organizations ORDER BY id"
    );
    return rows;
  }

  static async findById(id: number): Promise<IOrganization | null> {
    const { rows } = await pool.query(
      "SELECT * FROM organizations WHERE id=$1",
      [id]
    );
    return rows[0] || null;
  }

  static async create(name: string): Promise<IOrganization> {
    const { rows } = await pool.query(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING *",
      [name]
    );
    return rows[0];
  }

  static async update(id: number, name: string): Promise<IOrganization | null> {
    const { rows } = await pool.query(
      "UPDATE organizations SET name=$1 WHERE id=$2 RETURNING *",
      [name, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM organizations WHERE id=$1", [id]);
  }
}
