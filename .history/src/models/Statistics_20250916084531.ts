// src/models/StatisticsModel.ts
import { HistoryModel } from "./History";
import { DepartmentModel } from "./Department";

export class StatisticsModel {
  static async getDepartmentStats(startDate: string, endDate: string) {
    const histories = await HistoryModel.findByDateRange(startDate, endDate);
    const departments = await DepartmentModel.findAll();

    return departments.map((d) => {
      const sent = histories.filter(
        (h) => h.department_from_id === d.id
      ).length;
      const received = histories.filter(
        (h) => h.department_to_id === d.id
      ).length;
      return { id: d.id, name: d.name, sent, received };
    });
  }

  static async getGroupStats(startDate: string, endDate: string) {
    const histories = await HistoryModel.findByDateRange(startDate, endDate);

    const groupMap: Record<string, { sent: number; received: number }> = {};

    histories.forEach((h) => {
      if (!groupMap[h.receiver_name])
        groupMap[h.receiver] = { sent: 0, received: 0 };
      groupMap[h.receiver].received += 1;

      const fromKey = `Khoa-${h.department_from_id}`;
      if (!groupMap[fromKey]) groupMap[fromKey] = { sent: 0, received: 0 };
      groupMap[fromKey].sent += 1;
    });

    return Object.entries(groupMap).map(([label, value]) => ({
      label,
      ...value,
    }));
  }
}
