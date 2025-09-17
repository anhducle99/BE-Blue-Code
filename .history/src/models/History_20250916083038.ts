// models/History.ts
import { pool } from "./db";

export interface IHistory {
  id?: number;
  department_from: number;
  department_to: number;
  content: string;
  image?: string;
  receiver: string;
  status: "ko liên lạc" | "tham gia" | "ko tham gia";
  sent_at?: Date;
  received_at?: Date;
}

export class HistoryModel {
  static async findAll(): Promise<IHistory[]> {
    const { rows } = await pool.query(
      "SELECT * FROM history ORDER BY sent_at DESC"
    );
    return rows;
  }

  static async findByDateRange(
    start: string,
    end: string
  ): Promise<IHistory[]> {
    const { rows } = await pool.query(
      "SELECT * FROM history WHERE sent_at BETWEEN $1 AND $2 ORDER BY sent_at DESC",
      [start, end]
    );
    return rows;
  }

  static async create(entry: IHistory): Promise<IHistory> {
    const {
      department_from,
      department_to,
      content,
      image,
      receiver,
      status,
      sent_at,
      received_at,
    } = entry;
    const { rows } = await pool.query(
      `INSERT INTO history
       (department_from, department_to, content, image, receiver, status, sent_at, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        department_from,
        department_to,
        content,
        image,
        receiver,
        status,
        sent_at ?? new Date(),
        received_at,
      ]
    );
    return rows[0];
  }
}
