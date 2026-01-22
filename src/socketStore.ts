import { Server, Socket } from "socket.io";

export interface OnlineUser {
  socketId: string;
  name: string;
  department_id: string;
  department_name: string;
}

export const onlineUsers = new Map<string, OnlineUser>();

export const callTimers = new Map<string, NodeJS.Timeout>();

let io: Server;

export const setIO = (serverIO: Server) => {
  io = serverIO;
};

export const getIO = () => io;

/**
 * Normalize name để match chính xác (giống frontend)
 */
export const normalizeName = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
};

export const findSocketByDepartmentName = (name: string): Socket | null => {
  if (!io) return null;
  
  const normalizedName = normalizeName(name);
  
  for (const [key, user] of onlineUsers.entries()) {
    const normalizedUserDept = normalizeName(user.department_name || user.name);
    if (normalizedUserDept === normalizedName) {
      const socket = io.sockets.sockets.get(user.socketId);
      if (socket) {
        return socket;
      }
    }
  }
  
  return null;
};
