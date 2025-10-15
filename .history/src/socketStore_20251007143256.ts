import { Server } from "socket.io";

let io: Server | null = null;
export const onlineUsers: Record<string, string> = {};

export const setIO = (instance: Server) => {
  io = instance;
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.IO chưa được khởi tạo. Gọi setIO() trước.");
  return io;
};
