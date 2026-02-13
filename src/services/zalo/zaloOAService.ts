import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../../models/db';
import { zaloMockService } from './zaloMockService';

const ZALO_OA_TOKEN = process.env.ZALO_OA_TOKEN || '';
const ZALO_APP_ID = process.env.ZALO_APP_ID || '';
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET || '';

export interface ZaloMessagePayload {
  user_id: string;
  text?: string;
  attachment?: any;
}

export interface ZaloInteractiveMessage {
  user_id: string;
  callId: string;
  fromDept: string;
  message?: string;
  actionUrl?: string;
}

export class ZaloOAService {
  private static instance: ZaloOAService;
  private baseURL = 'https://openapi.zalo.me/v2.0/oa';

  static getInstance(): ZaloOAService {
    if (!ZaloOAService.instance) {
      ZaloOAService.instance = new ZaloOAService();
    }
    return ZaloOAService.instance;
  }


  async sendTextMessage(userId: string, text: string): Promise<any> {
    if (zaloMockService.isEnabled()) {
      return zaloMockService.sendTextMessage(userId, text);
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/message`,
        {
          recipient: { user_id: userId },
          message: { text },
        },
        {
          headers: {
            'access_token': ZALO_OA_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('[ZaloOA] Send message error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendEmergencyCallNotification(payload: ZaloInteractiveMessage): Promise<any> {
    const { user_id, callId, fromDept, message, actionUrl } = payload;
    
    if (zaloMockService.isEnabled()) {
      return zaloMockService.sendEmergencyCallNotification(payload);
    }

    try {
      const MINI_APP_ID = process.env.ZALO_MINI_APP_ID || '';
      const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bluecode.vn';
      
      const miniAppDeepLink = MINI_APP_ID 
        ? `https://zalo.me/s/${MINI_APP_ID}/?callId=${callId}`
        : `${FRONTEND_URL}/mini-app?callId=${callId}`;

      const text = `🚨 CÓ CUỘC GỌI KHẨN CẤP\n\nTừ: ${fromDept}\nNội dung: ${message || 'Không có nội dung'}\n\n👉 Mở Mini App để xử lý: ${miniAppDeepLink}\n\nHoặc phản hồi nhanh:`;
      
      const response = await axios.post(
        `${this.baseURL}/message`,
        {
          recipient: { user_id },
          message: {
            text,
            quick_replies: [
              {
                content_type: 'text',
                title: '✅ NHẬN',
                payload: `ACCEPT_${callId}`,
              },
              {
                content_type: 'text',
                title: '❌ TỪ CHỐI',
                payload: `REJECT_${callId}`,
              },
            ],
          },
        },
        {
          headers: {
            'access_token': ZALO_OA_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[ZaloOA] Sent emergency notification to ${user_id} for call ${callId} with Mini App link: ${miniAppDeepLink}`);
      return response.data;
    } catch (error: any) {
      console.error('[ZaloOA] Send emergency notification error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendCallStatusNotification(userId: string, callId: string, status: 'accepted' | 'rejected' | 'timeout' | 'cancelled'): Promise<any> {
    if (zaloMockService.isEnabled()) {
      return zaloMockService.sendCallStatusNotification(userId, callId, status);
    }

    const statusText: Record<string, string> = {
      accepted: '✅ Đã có ngưởi nhận cuộc gọi',
      rejected: '❌ Cuộc gọi đã bị từ chối',
      timeout: '⏱️ Cuộc gọi đã hết thởi gian chờ',
      cancelled: 'ℹ️ Cuộc gọi đã bị hủy',
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/message`,
        {
          recipient: { user_id: userId },
          message: { text: `${statusText[status]}\nMã cuộc gọi: ${callId}` },
        },
        {
          headers: {
            'access_token': ZALO_OA_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('[ZaloOA] Send status notification error:', error.response?.data || error.message);
      throw error;
    }
  }


  async getUserProfile(userId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseURL}/getprofile`,
        {
          params: { user_id: userId },
          headers: { 'access_token': ZALO_OA_TOKEN },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('[ZaloOA] Get user profile error:', error.response?.data || error.message);
      throw error;
    }
  }

  verifyWebhookSignature(body: string, signature: string, timestamp: string): boolean {
    const mac = crypto
      .createHmac('sha256', ZALO_APP_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    
    return mac === signature;
  }
}

export const zaloOAService = ZaloOAService.getInstance();
