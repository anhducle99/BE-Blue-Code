import { prisma } from "./db";

export class StatisticsService {
  static async getDepartmentStats(startDate?: string, endDate?: string) {
    const params: any[] = [];
    let whereClause = "WHERE 1=1";

    if (startDate && endDate) {
      params.push(startDate, endDate);
      whereClause += ` AND h.sent_at >= $1::timestamp AND h.sent_at <= $2::timestamp`;
    }

    const query = `
      SELECT 
        d.id,
        d.name,
        COALESCE(SUM(CASE WHEN h.department_from_id = d.id THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN h.department_to_id   = d.id THEN 1 ELSE 0 END), 0) AS received
      FROM departments d
      LEFT JOIN history h
        ON h.department_from_id = d.id OR h.department_to_id = d.id
      ${whereClause}
      GROUP BY d.id, d.name
      ORDER BY d.name
    `;

    const result = (await prisma.$queryRawUnsafe(query, ...params)) as Array<{
      id: number;
      name: string;
      sent: bigint;
      received: bigint;
    }>;

    return result.map(
      (row: { id: number; name: string; sent: bigint; received: bigint }) => ({
        ...row,
        sent: Number(row.sent),
        received: Number(row.received),
      })
    );
  }

  static async getGroupStats(startDate?: string, endDate?: string) {
    const params: any[] = [];
    let whereClause = "WHERE d.alert_group IS NOT NULL";

    if (startDate && endDate) {
      params.push(startDate, endDate);
      whereClause += ` AND h.sent_at >= $1::timestamp AND h.sent_at <= $2::timestamp`;
    }

    const query = `
      SELECT 
        d.alert_group AS label,
        COALESCE(SUM(CASE WHEN h.department_from_id = d.id THEN 1 ELSE 0 END), 0) AS sent,
        COALESCE(SUM(CASE WHEN h.department_to_id   = d.id THEN 1 ELSE 0 END), 0) AS received
      FROM departments d
      LEFT JOIN history h
        ON h.department_from_id = d.id OR h.department_to_id = d.id
      ${whereClause}
      GROUP BY d.alert_group
      ORDER BY d.alert_group
    `;

    const result = (await prisma.$queryRawUnsafe(query, ...params)) as Array<{
      label: string;
      sent: bigint;
      received: bigint;
    }>;

    return result.map(
      (row: { label: string; sent: bigint; received: bigint }) => ({
        ...row,
        sent: Number(row.sent),
        received: Number(row.received),
      })
    );
  }
}
