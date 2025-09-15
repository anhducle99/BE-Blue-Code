// src/@types/express/global.d.ts
import { JwtPayload } from "jsonwebtoken";

// Định nghĩa interface cho user
interface UserPayload extends JwtPayload {
  id: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// Export để có thể import ở nơi khác nếu cần
export interface AuthenticatedRequest extends Express.Request {
  user?: UserPayload;
}
