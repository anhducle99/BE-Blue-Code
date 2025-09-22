import { Request, Response } from "express";
import { pool } from "../models/db";

export const getDepartmentStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        d.id,
        d.name,
        d.alert_group,   -- 👈 giữ lại trường gốc để debug
        COALESCE(SUM(sent.count), 0) AS sent,
        COALESCE(SUM(received.count), 0) AS received
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
      GROUP BY d.id, d.name, d.alert_group
      ORDER BY d.alert_group
    `,
      [startDate, endDate]
    );

    // 🔥 Debug chi tiết dữ liệu trả về
    console.log("==== DEBUG getGroupStats ====");
    result.rows.forEach((row, i) => {
      console.log(
        `Row ${i}: id=${row.id}, name=${row.name}, alert_group=${row.alert_group}, sent=${row.sent}, received=${row.received}`
      );
    });
    console.log("=============================");

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("Lỗi getGroupStats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getGroupStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        d.alert_group AS label,
        COALESCE(SUM(sent.count), 0) AS sent,
        COALESCE(SUM(received.count), 0) AS received
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
    `,
      [startDate, endDate]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("Lỗi getGroupStats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
