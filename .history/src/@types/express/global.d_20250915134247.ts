// declare namespace Express {
//   interface Request {
//     user?: { id: number; role: string };
//   }
// }
declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}
