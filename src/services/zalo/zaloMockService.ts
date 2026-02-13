import { prisma } from '../../models/db';

export interface MockZaloMessage {
  userId: string;
  text: string;
  timestamp: Date;
}

const mockMessages: MockZaloMessage[] = [];

export class ZaloMockService {
  private static instance: ZaloMockService;
  private enabled: boolean;

  constructor() {
    this.enabled = !process.env.ZALO_OA_TOKEN || process.env.USE_ZALO_MOCK === 'true';
    if (this.enabled) {
      console.log('[ZaloMock] ⚠️  MOCK MODE ENABLED - Không gửi Zalo thật');
      console.log('[ZaloMock] Xem log để thấy messages sẽ gửi');
    }
  }

  static getInstance(): ZaloMockService {
    if (!ZaloMockService.instance) {
      ZaloMockService.instance = new ZaloMockService();
    }
    return ZaloMockService.instance;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

 
  async sendTextMessage(userId: string, text: string): Promise<any> {
    if (!this.enabled) {
      throw new Error('Mock not enabled');
    }

    const message: MockZaloMessage = {
      userId,
      text,
      timestamp: new Date(),
    };
    mockMessages.push(message);

    console.log('\n📨 [ZaloMock] SEND TEXT MESSAGE:');
    console.log('   To User ID:', userId);
    console.log('   Content:', text);
    console.log('   Time:', message.timestamp.toISOString());
    console.log('');

    return {
      success: true,
      mock: true,
      messageId: `mock_${Date.now()}`,
    };
  }

  async sendEmergencyCallNotification(payload: {
    user_id: string;
    callId: string;
    fromDept: string;
    message?: string;
    actionUrl?: string;
  }): Promise<any> {
    if (!this.enabled) {
      throw new Error('Mock not enabled');
    }

    const { user_id, callId, fromDept, message, actionUrl } = payload;
    
    const MINI_APP_ID = process.env.ZALO_MINI_APP_ID || '';
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bluecode.vn';
    const miniAppDeepLink = MINI_APP_ID 
      ? `https://zalo.me/s/${MINI_APP_ID}/?callId=${callId}`
      : `${FRONTEND_URL}/mini-app?callId=${callId}`;
    
    const text = `🚨 CÓ CUỘC GỌI KHẨN CẤP\n\nTừ: ${fromDept}\nNội dung: ${message || 'Không có nội dung'}\n\n👉 Mở Mini App: ${miniAppDeepLink}\n\nHoặc phản hồi:\n✅ NHẬN\n❌ TỪ CHỐI`;

    console.log('\n🚨 [ZaloMock] SEND EMERGENCY NOTIFICATION:');
    console.log('   To User ID:', user_id);
    console.log('   Call ID:', callId);
    console.log('   From:', fromDept);
    console.log('   Message:', message || 'N/A');
    console.log('   Mini App Link:', miniAppDeepLink);
    console.log('   Time:', new Date().toISOString());
    console.log('');

    return {
      success: true,
      mock: true,
      messageId: `mock_emergency_${Date.now()}`,
      miniAppLink: miniAppDeepLink,
    };
  }


  async sendCallStatusNotification(
    userId: string,
    callId: string,
    status: 'accepted' | 'rejected' | 'timeout' | 'cancelled'
  ): Promise<any> {
    if (!this.enabled) {
      throw new Error('Mock not enabled');
    }

    const statusText = {
      accepted: '✅ Đã có ngưởi nhận cuộc gọi',
      rejected: '❌ Cuộc gọi đã bị từ chối',
      timeout: '⏱️ Cuộc gọi đã hết thởi gian chờ',
    };

    console.log('\n📢 [ZaloMock] SEND STATUS UPDATE:');
    console.log('   To User ID:', userId);
    console.log('   Call ID:', callId);
    console.log('   Status:', status);
    console.log('   Time:', new Date().toISOString());
    console.log('');

    return {
      success: true,
      mock: true,
      messageId: `mock_status_${Date.now()}`,
    };
  }

  getMockMessages(): MockZaloMessage[] {
    return [...mockMessages];
  }


  clearMockMessages(): void {
    mockMessages.length = 0;
  }

 
  async simulateUserReply(
    zaloUserId: string,
    text: string
  ): Promise<any> {
    console.log('\n📥 [ZaloMock] SIMULATE USER REPLY:');
    console.log('   From Zalo User:', zaloUserId);
    console.log('   Text:', text);
    console.log('');

    const mockWebhookPayload = {
      event: 'user_send_text',
      sender: { id: zaloUserId },
      message: { text },
      event_id: `mock_event_${Date.now()}`,
    };

    const { default: zaloWebhookRoutes } = await import('../../routes/zaloWebhookRoutes');
    
    return {
      success: true,
      payload: mockWebhookPayload,
      note: 'Webhook payload sẵn sàng, gửi POST /api/zalo/webhook để xử lý',
    };
  }
}

export const zaloMockService = ZaloMockService.getInstance();
