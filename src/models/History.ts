import { prisma } from "./db.js";

export interface IHistory {
  id?: number;
  department_from_id: number;
  department_to_id: number;
  content: string;
  image?: string;
  receiver_name?: string;
  status?: "ko liên lạc" | "tham gia" | "ko tham gia";
  sent_at?: Date;
  confirmed_at?: Date;
}

export class HistoryModel {
  static async create(history: IHistory): Promise<IHistory> {
    const {
      department_from_id,
      department_to_id,
      content,
      image,
      receiver_name,
      status,
    } = history;

    const created = await prisma.history.create({
      data: {
        departmentFromId: department_from_id,
        departmentToId: department_to_id,
        content,
        image,
        receiverName: receiver_name,
        status: status || "ko liên lạc",
      },
    });

    return {
      id: created.id,
      department_from_id: created.departmentFromId,
      department_to_id: created.departmentToId,
      content: created.content,
      image: created.image || undefined,
      receiver_name: created.receiverName || undefined,
      status: created.status as IHistory["status"],
      sent_at: created.sentAt,
      confirmed_at: created.confirmedAt || undefined,
    };
  }

  static async findAll(
    startDate?: string,
    endDate?: string
  ): Promise<IHistory[]> {
    const where: any = {};

    if (startDate && endDate) {
      where.sentAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const histories = await prisma.history.findMany({
      where,
      orderBy: { sentAt: "desc" },
    });

    return histories.map((h: any) => ({
      id: h.id,
      department_from_id: h.departmentFromId,
      department_to_id: h.departmentToId,
      content: h.content,
      image: h.image || undefined,
      receiver_name: h.receiverName || undefined,
      status: h.status as IHistory["status"],
      sent_at: h.sentAt,
      confirmed_at: h.confirmedAt || undefined,
    }));
  }

  static async findByDateRange(
    startDate: string,
    endDate: string
  ): Promise<IHistory[]> {
    const histories = await prisma.history.findMany({
      where: {
        sentAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { sentAt: "desc" },
    });

    return histories.map((h: any) => ({
      id: h.id,
      department_from_id: h.departmentFromId,
      department_to_id: h.departmentToId,
      content: h.content,
      image: h.image || undefined,
      receiver_name: h.receiverName || undefined,
      status: h.status as IHistory["status"],
      sent_at: h.sentAt,
      confirmed_at: h.confirmedAt || undefined,
    }));
  }

  static async confirm(
    id: number,
    confirmed_at: Date,
    status: IHistory["status"]
  ): Promise<IHistory | null> {
    const updated = await prisma.history.update({
      where: { id },
      data: {
        confirmedAt: confirmed_at,
        status,
      },
    });

    return {
      id: updated.id,
      department_from_id: updated.departmentFromId,
      department_to_id: updated.departmentToId,
      content: updated.content,
      image: updated.image || undefined,
      receiver_name: updated.receiverName || undefined,
      status: updated.status as IHistory["status"],
      sent_at: updated.sentAt,
      confirmed_at: updated.confirmedAt || undefined,
    };
  }

  static async delete(id: number): Promise<void> {
    await prisma.history.delete({
      where: { id },
    });
  }
}
