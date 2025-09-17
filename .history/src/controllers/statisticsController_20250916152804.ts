import { Request, Response } from "express";
import { pool } from "../models/db";

export const getDepartmentStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const query = `
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COALESCE(sent.count, 0) AS sent,
        COALESCE(received.count, 0) AS received
      FROM departments d
      LEFT JOIN (
        SELECT department_from AS dept_id, COUNT(*) AS count
        FROM history
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY department_from
      ) sent ON sent.dept_id = d.id
      LEFT JOIN (
        SELECT department_to AS dept_id, COUNT(*) AS count
        FROM history
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY department_to
      ) received ON received.dept_id = d.id
      ORDER BY d.id
    `;

    const result = await pool.query(query, [startDate, endDate]);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("❌ Lỗi getDepartmentStats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getGroupStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const query = `
      SELECT
        d.alert_group AS label,
        SUM(COALESCE(sent.count,0)) AS sent,
        SUM(COALESCE(received.count,0)) AS received
      FROM departments d
      LEFT JOIN (
        SELECT department_from AS dept_id, COUNT(*) AS count
        FROM history
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY department_from
      ) sent ON sent.dept_id = d.id
      LEFT JOIN (
        SELECT department_to AS dept_id, COUNT(*) AS count
        FROM history
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY department_to
      ) received ON received.dept_id = d.id
      WHERE d.alert_group IS NOT NULL
      GROUP BY d.alert_group
      ORDER BY d.alert_group
    `;

    const result = await pool.query(query, [startDate, endDate]);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("❌ Lỗi getGroupStats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
