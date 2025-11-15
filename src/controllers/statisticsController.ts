import { Request, Response } from "express";
import { pool } from "../models/db";

function getUTCDateRangeVN(startStr: string, endStr: string) {
  let start = new Date(startStr);
  let end = new Date(endStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("startDate hoặc endDate không hợp lệ");
  }

  if (start > end) [start, end] = [end, start];

  const offset = 7 * 60;
  const startVN = new Date(start.getTime() + offset * 60 * 1000);
  const endVN = new Date(end.getTime() + offset * 60 * 1000);

  startVN.setHours(0, 0, 0, 0);
  endVN.setHours(23, 59, 59, 999);

  const startUTC = new Date(startVN.getTime() - offset * 60 * 1000);
  const endUTC = new Date(endVN.getTime() - offset * 60 * 1000);

  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

export const getDepartmentStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate và endDate là bắt buộc",
    });
  }

  try {
    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    const logsResult = await pool.query(
      `
      SELECT id, from_user, to_user, created_at
      FROM call_logs
      WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
      ORDER BY created_at ASC
      `,
      [start, end]
    );
    const logs = logsResult.rows;

    const deptResult = await pool.query(
      `SELECT id, name, alert_group FROM departments ORDER BY id`
    );
    const departments = deptResult.rows;

    const deptMap: Record<string, any> = {};
    departments.forEach((d) => {
      deptMap[d.name.trim().toLowerCase()] = {
        id: d.id,
        name: d.name,
        alert_group: d.alert_group,
        sent: 0,
        received: 0,
      };
    });

    logs.forEach((l) => {
      const fromKey = l.from_user.trim().toLowerCase();
      const toKey = l.to_user.trim().toLowerCase();
      if (deptMap[fromKey]) deptMap[fromKey].sent += 1;
      if (deptMap[toKey]) deptMap[toKey].received += 1;
    });

    const deptStats = Object.values(deptMap);
    res.json(deptStats);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getGroupStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate và endDate là bắt buộc",
    });
  }

  try {
    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    const logsResult = await pool.query(
      `
      SELECT id, from_user, to_user, created_at
      FROM call_logs
      WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
      ORDER BY created_at ASC
      `,
      [start, end]
    );
    const logs = logsResult.rows;

    const deptResult = await pool.query(
      `SELECT id, name, alert_group FROM departments WHERE alert_group IS NOT NULL`
    );
    const departments = deptResult.rows;

    const deptMap: Record<string, any> = {};
    departments.forEach((d) => {
      deptMap[d.name.trim().toLowerCase()] = {
        id: d.id,
        alert_group: d.alert_group,
        sent: 0,
        received: 0,
      };
    });

    logs.forEach((l) => {
      const fromKey = l.from_user.trim().toLowerCase();
      const toKey = l.to_user.trim().toLowerCase();
      if (deptMap[fromKey]) deptMap[fromKey].sent += 1;
      if (deptMap[toKey]) deptMap[toKey].received += 1;
    });

    const deptStats = Object.values(deptMap);

    const groupMap: Record<string, { sent: number; received: number }> = {};
    deptStats.forEach((d) => {
      const group = d.alert_group.trim();
      if (!groupMap[group]) groupMap[group] = { sent: 0, received: 0 };
      groupMap[group].sent += d.sent;
      groupMap[group].received += d.received;
    });

    const groupStats = Object.entries(groupMap).map(([label, counts]) => ({
      label,
      sent: counts.sent,
      received: counts.received,
    }));

    res.json(groupStats);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
