import { pool } from "./db";

export interface IHistory {
  id?: number;
  department_from_id: number; // khoa gửi
  department_to_id: number; // khoa nhận
  content: string; // nội dung thông báo
  image?: string; // link hoặc base64 hình ảnh
  receiver_name?: string; // người nhận
  status?: "ko liên lạc" | "tham gia" | "ko tham gia"; // trạng thái
  sent_at?: Date; // thời gian gửi
  confirmed_at?: Date; // thời gian xác nhận
}

export class HistoryModel {
  /** Tạo bản ghi mới */
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

  /** Lấy tất cả lịch sử, có thể lọc theo khoảng ngày */
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

  /** Lấy lịch sử theo khoảng ngày (dành cho thống kê) */
  static async findByDateRange(
    startDate: string,
    endDate: string
  ): Promise<IHistory[]> {
    const { rows } = await pool.query(
      `SELECT * FROM history
       WHERE sent_at BETWEEN $1 AND $2
       ORDER BY sent_at DESC`,
      [startDate, endDate]
    );
    return rows;
  }

  static async confirm(
    id: number,
    confirmed_at: Date,
    status: IHistory["status"]
  ): Promise<IHistory | null> {
    const { rows } = await pool.query(
      `UPDATE history
       SET confirmed_at = $1, status = $2
       WHERE id = $3
       RETURNING *`,
      [confirmed_at, status, id]
    );
    return rows[0] || null;
  }

  static async delete(id: number): Promise<void> {
    await pool.query(`DELETE FROM history WHERE id = $1`, [id]);
  }
}
