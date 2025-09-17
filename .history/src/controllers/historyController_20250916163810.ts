import { Request, Response } from "express";
import { pool } from "../models/db";

export const getHistory = async (req: Request, res: Response) => {
  const { bat_dau, ket_thuc, nguoi_gui, nguoi_nhan } = req.query;

  try {
    let query = `
      SELECT 
        h.id,
        d_from.name AS department_from,
        d_to.name AS department_to,
        h.content,
        h.image,
        h.receiver,
        h.status,
        h.sent_at,
        h.received_at
      FROM history h
      JOIN departments d_from ON h.department_from = d_from.id
      JOIN departments d_to   ON h.department_to   = d_to.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (bat_dau) {
      params.push(bat_dau);
      query += ` AND h.sent_at >= $${params.length}`;
    }
    if (ket_thuc) {
      params.push(ket_thuc);
      query += ` AND h.sent_at <= $${params.length}`;
    }
    if (nguoi_gui) {
      params.push(`%${nguoi_gui}%`);
      query += ` AND d_from.name ILIKE $${params.length}`;
    }
    if (nguoi_nhan) {
      params.push(`%${nguoi_nhan}%`);
      query += ` AND d_to.name ILIKE $${params.length}`;
    }

    query += " ORDER BY h.sent_at DESC";

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("Lỗi getHistory:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createHistory = async (req: Request, res: Response) => {
  try {
    const { department_from, department_to, content, image, receiver, status } =
      req.body;

    const result = await pool.query(
      `INSERT INTO history 
        (department_from, department_to, content, image, receiver, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [department_from, department_to, content, image, receiver, status]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error("Lỗi createHistory:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
