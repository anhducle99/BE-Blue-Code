import { Request, Response } from "express";
import { HistoryModel } from "../models/History";

export const getHistory = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  try {
    const histories = await HistoryModel.findAll(
      startDate as string,
      endDate as string
    );
    res.json({ success: true, data: histories });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createHistory = async (req: Request, res: Response) => {
  try {
    const history = await HistoryModel.create(req.body);
    res.status(201).json({ success: true, data: history });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
