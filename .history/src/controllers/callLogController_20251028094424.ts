import { Request, Response } from "express";
import { pool } from "../db";

export const CallLogController = {
  // ✅ 1. Ghi log mới khi tạo cuộc gọi
  async create(req: Request, res: Response) {
    try {
      const { call_id, from_user, to_user, message, image_url } = req.body;

      if (!call_id || !from_user || !to_user) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const result = await pool.query(
        `
        INSERT INTO call_logs (call_id, from_user, to_user, message, image_url, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *;
        `,
        [call_id, from_user, to_user, message || null, image_url || null]
      );

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Error inserting call log:", err);
      res
        .status(500)
        .json({ success: false, message: "Error inserting call log" });
    }
  },

  async updateStatus(req: Request, res: Response) {
    try {
      const { call_id } = req.params;
      const { status } = req.body;

      if (!["accepted", "rejected", "timeout", "failed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const result = await pool.query(
        `
        UPDATE call_logs
        SET status = $1
        WHERE call_id = $2
        RETURNING *;
        `,
        [status, call_id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Call log not found" });
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Error updating call log:", err);
      res
        .status(500)
        .json({ success: false, message: "Error updating call log" });
    }
  },

  async getAll(req: Request, res: Response) {
    try {
      const { from_user, to_user, status, page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const conditions: string[] = [];
      const params: any[] = [];

      if (from_user) {
        params.push(from_user);
        conditions.push(`from_user = $${params.length}`);
      }

      if (to_user) {
        params.push(to_user);
        conditions.push(`to_user = $${params.length}`);
      }

      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const query = `
        SELECT *
        FROM call_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2};
      `;

      const result = await pool.query(query, [...params, limit, offset]);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Error fetching call logs:", err);
      res
        .status(500)
        .json({ success: false, message: "Error fetching call logs" });
    }
  },
};
