import { Request, Response } from "express";
import { pool } from "../models/db";

export const getCallHistory = async (req: Request, res: Response) => {
  try {
    const { sender, receiver, startDate, endDate } = req.query;

    let query = `
      SELECT
        id,
        call_id,
        from_user AS sender,
        to_user AS receiver,
        message,
        status,
        created_at,
        accepted_at,
        rejected_at,
        image_url
      FROM call_logs
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (sender) {
      query += ` AND from_user ILIKE $${paramIndex++}`;
      params.push(`%${sender}%`);
    }

    if (receiver) {
      query += ` AND to_user ILIKE $${paramIndex++}`;
      params.push(`%${receiver}%`);
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};
