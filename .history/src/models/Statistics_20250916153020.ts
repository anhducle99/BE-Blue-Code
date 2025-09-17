import { pool } from "../models/db";

export class StatisticsService {
  static async getDepartmentStats(startDate?: string, endDate?: string) {
    const params: any[] = [];
    let query = `
      SELECT 
        d.id,
        d.name,
        COALESCE(SUM(CASE WHEN h.department_from = d.id THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN h.department_to   = d.id THEN 1 ELSE 0 END), 0) AS received
      FROM departments d
      LEFT JOIN history h
        ON h.department_from = d.id OR h.department_to = d.id
      WHERE 1=1
    `;

    if (startDate) {
      params.push(startDate);
      query += ` AND h.sent_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND h.sent_at <= $${params.length}`;
    }

    query += `
      GROUP BY d.id
      ORDER BY d.name
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getGroupStats(startDate?: string, endDate?: string) {
    const params: any[] = [];
    let query = `
      SELECT 
        d.alert_group AS label,
        COALESCE(SUM(CASE WHEN h.department_from = d.id THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN h.department_to   = d.id THEN 1 ELSE 0 END), 0) AS received
      FROM departments d
      LEFT JOIN history h
        ON h.department_from = d.id OR h.department_to = d.id
      WHERE d.alert_group IS NOT NULL
    `;

    if (startDate) {
      params.push(startDate);
      query += ` AND h.sent_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND h.sent_at <= $${params.length}`;
    }

    query += `
      GROUP BY d.alert_group
      ORDER BY d.alert_group
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }
}
