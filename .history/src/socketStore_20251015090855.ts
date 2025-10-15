import { Server } from "socket.io";

export interface OnlineUser {
  socketId: string;
  name: string;
  department_id: string;
  department_name: string;
}

export const onlineUsers = new Map<string, OnlineUser>();

let io: Server;

export const setIO = (serverIO: Server) => {
  io = serverIO;
};

export const getIO = () => io;
