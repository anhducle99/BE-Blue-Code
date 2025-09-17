import { pool } from "./db";

export interface IHistory {
  id?: number;
  department_from_id: number;
  department_to_id: number;
  content: string;
  image?: string;
  receiver_name?: string;
  status?: "ko liên lạc" | "tham gia" | "ko tham gia";
  sent_at?: Date;
  confirmed_at?: Date;
}

export class HistoryModel {
  static async findAll(
    startDate?: string,
    endDate?: string
  ): Promise<IHistory[]> {
    let query = "SELECT * FROM history";
    const params: any[] = [];

    if (startDate && endDate) {
      query += " WHERE sent_at BETWEEN $1 AND $2";
      params.push(startDate, endDate);
    }
    query += " ORDER BY sent_at DESC";

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async create(history: IHistory): Promise<IHistory> {
    const {
      department_from_id,
      department_to_id,
      content,
      image,
      receiver_name,
      status,
    } = history;
    const { rows } = await pool.query(
      `INSERT INTO history 
      (department_from_id, department_to_id, content, image, receiver_name, status, sent_at) 
      VALUES ($1,$2,$3,$4,$5,$6,NOW()) 
      RETURNING *`,
      [
        department_from_id,
        department_to_id,
        content,
        image,
        receiver_name,
        status,
      ]
    );
    return rows[0];
  }
}
