import { Request, Response } from "express";
import { CallLogModel } from "../models/CallLog";

export const getCallHistory = async (req: Request, res: Response) => {
  try {
    const { sender, receiver, startDate, endDate } = req.query;

    const logs = await CallLogModel.findByFilters({
      sender: sender as string,
      receiver: receiver as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    const result = logs.map((log) => ({
      id: log.id,
      call_id: log.call_id,
      sender: log.from_user,
      receiver: log.to_user,
      message: log.message,
      status: log.status,
      created_at: log.created_at,
      accepted_at: log.accepted_at,
      rejected_at: log.rejected_at,
      image_url: log.image_url,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};
