import { pool } from "./db";

export interface IHistory {
  id?: number;
  action: string;
  user_id: number;
  created_at?: Date;
}

export class HistoryModel {
  static async findAll(): Promise<IHistory[]> {
    const { rows } = await pool.query(
      "SELECT * FROM history ORDER BY created_at DESC"
    );
    return rows;
  }

  static async findById(id: number): Promise<IHistory | null> {
    const { rows } = await pool.query("SELECT * FROM history WHERE id=$1", [
      id,
    ]);
    return rows[0] || null;
  }

  static async create(action: string, user_id: number): Promise<IHistory> {
    const { rows } = await pool.query(
      "INSERT INTO history (action,user_id) VALUES ($1,$2) RETURNING *",
      [action, user_id]
    );
    return rows[0];
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM history WHERE id=$1", [id]);
  }
}
