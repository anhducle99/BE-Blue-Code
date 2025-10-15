import { Server } from "socket.io";

export interface OnlineUser {
  socketId: string;
  name: string;
  department_id: string;
  department_name: string;
  phone?: string;
}

export const onlineUsers = new Map<string, OnlineUser>();

let io: Server;

export const setIO = (serverIO: Server) => {
  io = serverIO;
};

export const getIO = () => io;

export const registerOnlineUser = (key: string, user: OnlineUser) => {
  onlineUsers.set(key, user);
};

export const removeOnlineUser = (socketId: string) => {
  for (const [key, user] of onlineUsers.entries()) {
    if (user.socketId === socketId) {
      onlineUsers.delete(key);
      console.log("🗑 Removed:", key);
      break;
    }
  }
};

export const debugOnlineUsers = () => {
  console.log(
    "📍 Online users:",
    Array.from(onlineUsers.entries()).map(([key, user]) => ({
      key,
      socketId: user.socketId,
      name: user.name,
      dept: user.department_name,
    }))
  );
};
