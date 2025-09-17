import { pool } from "./db";

export interface IHistory {
  id?: number;
  department_from_id: number;
  department_to_id: number;
  message: string;
  image_url?: string;
  receiver_id?: number;
  status?: "pending" | "confirmed" | "rejected";
  sent_at?: string;
  confirmed_at?: string;
  created_by?: number;
}

export class HistoryModel {
  static async findAll(): Promise<IHistory[]> {
    const { rows } = await pool.query(
      "SELECT * FROM history ORDER BY sent_at DESC"
    );
    return rows;
  }

  static async create(history: IHistory): Promise<IHistory> {
    const {
      department_from_id,
      department_to_id,
      message,
      image_url,
      receiver_id,
      status = "pending",
      created_by,
    } = history;

    const { rows } = await pool.query(
      `INSERT INTO history
      (department_from_id, department_to_id, message, image_url, receiver_id, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        department_from_id,
        department_to_id,
        message,
        image_url,
        receiver_id,
        status,
        created_by,
      ]
    );
    return rows[0];
  }

  static async updateStatus(
    id: number,
    status: "pending" | "confirmed" | "rejected"
  ): Promise<IHistory | null> {
    const { rows } = await pool.query(
      `UPDATE history
       SET status=$1, confirmed_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [status, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM history WHERE id=$1", [id]);
  }
}
