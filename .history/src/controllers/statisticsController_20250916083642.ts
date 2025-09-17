import { Request, Response } from "express";
import { HistoryModel } from "../models/History";
import { DepartmentModel } from "../models/Department";

// Thống kê theo Departments
export const getDepartmentStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const histories = await HistoryModel.findByDateRange(
      startDate as string,
      endDate as string
    );
    const departments = await DepartmentModel.findAll();

    const result = departments.map((d) => {
      const sent = histories.filter((h) => h.department_from === d.id).length;
      const received = histories.filter((h) => h.department_to === d.id).length;
      return { id: d.id, name: d.name, sent, received };
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Thống kê theo Groups/receiver
export const getGroupStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const histories = await HistoryModel.findByDateRange(
      startDate as string,
      endDate as string
    );

    const groupMap: Record<string, { sent: number; received: number }> = {};

    histories.forEach((h) => {
      // receiver
      if (!groupMap[h.receiver])
        groupMap[h.receiver] = { sent: 0, received: 0 };
      groupMap[h.receiver].received += 1;

      // sender group (department_from)
      const fromKey = `Khoa-${h.department_from}`;
      if (!groupMap[fromKey]) groupMap[fromKey] = { sent: 0, received: 0 };
      groupMap[fromKey].sent += 1;
    });

    const result = Object.entries(groupMap).map(([label, value]) => ({
      label,
      ...value,
    }));

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
