import { Request, Response } from "express";
import { CallLogModel } from "../models/CallLog";
import { UserModel } from "../models/User";

export const getCallHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng"
      });
    }

    const user = await UserModel.findById(userId);

    if (!user || !user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào"
      });
    }

    const { sender, receiver, startDate, endDate } = req.query;

    const logs = await CallLogModel.findByOrganization(
      user.organization_id,
      {
        sender: sender as string,
        receiver: receiver as string,
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

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

    return res.json(result);
  } catch (error) {
    console.error("Error in getCallHistory:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử cuộc gọi"
    });
  }
};
