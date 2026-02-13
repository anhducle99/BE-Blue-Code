import { prisma } from '../../models/db';
import crypto from 'crypto';

const CODE_EXPIRY_MINUTES = 5;
const CODE_LENGTH = 6;

export class ZaloLinkService {
  private static instance: ZaloLinkService;

  static getInstance(): ZaloLinkService {
    if (!ZaloLinkService.instance) {
      ZaloLinkService.instance = new ZaloLinkService();
    }
    return ZaloLinkService.instance;
  }

 
  async generateLinkCode(userId: number, organizationId?: number | null): Promise<string> {
    await prisma.zaloLinkCode.deleteMany({
      where: { userId: userId }
    });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiredAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await prisma.zaloLinkCode.create({
      data: {
        code,
        userId: userId,
        organizationId: organizationId,
        expiredAt: expiredAt,
      }
    });

    return code;
  }

 
  async verifyAndLink(code: string, zaloUserId: string): Promise<{ success: boolean; message: string; userId?: number }> {
    try {
      const linkCode = await prisma.zaloLinkCode.findUnique({
        where: { code },
        include: { user: true }
      });

      if (!linkCode) {
        return { success: false, message: 'Mã không hợp lệ' };
      }

      if (linkCode.usedAt) {
        return { success: false, message: 'Mã đã được sử dụng' };
      }
      
      if (new Date() > linkCode.expiredAt) {
        return { success: false, message: 'Mã đã hết hạn' };
      }

      const existingLink = await prisma.user.findFirst({
        where: { 
          zaloUserId: zaloUserId,
          id: { not: linkCode.userId }
        }
      });

      if (existingLink) {
        return { success: false, message: 'Zalo account này đã được link với user khác' };
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: linkCode.userId },
          data: {
            zaloUserId: zaloUserId,
            zaloVerified: true,
            zaloLinkedAt: new Date(),
          }
        }),
        prisma.zaloLinkCode.update({
          where: { id: linkCode.id },
          data: { usedAt: new Date() }
        })
      ]);

      return { 
        success: true, 
        message: 'Link thành công', 
        userId: linkCode.userId 
      };
    } catch (error) {
      console.error('[ZaloLink] Verify error:', error);
      return { success: false, message: 'Lỗi hệ thống' };
    }
  }

 
  async unlinkUser(userId: number): Promise<boolean> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          zaloUserId: null,
          zaloVerified: false,
          zaloLinkedAt: null,
        }
      });
      return true;
    } catch (error) {
      console.error('[ZaloLink] Unlink error:', error);
      return false;
    }
  }

  async getLinkedUsers(organizationId?: number | null) {
    return prisma.user.findMany({
      where: {
        zaloVerified: true,
        ...(organizationId ? { organizationId: organizationId } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        zaloUserId: true,
        zaloLinkedAt: true,
        departmentId: true,
        organizationId: true,
      }
    });
  }
}

export const zaloLinkService = ZaloLinkService.getInstance();
