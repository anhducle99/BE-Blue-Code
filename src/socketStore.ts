import { Server, Socket } from "socket.io";

export interface OnlineUser {
  socketId: string;
  name: string;
  department_id: string;
  department_name: string;
}

export const onlineUsers = new Map<string, OnlineUser>();

export const callTimers = new Map<string, NodeJS.Timeout>();

const emittedCallLogs = new Map<string, number>();

let io: Server;

export const setIO = (serverIO: Server) => {
  io = serverIO;
};

export const getIO = () => io;

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


export const emitCallLogCreated = (callLogData: any, organizationId?: number | null) => {
  if (!io) return;
  
  const callLogId = callLogData.id?.toString();
  if (!callLogId) return;

  const lastEmitted = emittedCallLogs.get(callLogId);
  if (lastEmitted && Date.now() - lastEmitted < 1000) {
    return;
  }

  const fullCallLogData = {
    id: callLogData.id,
    call_id: callLogData.call_id,
    from_user: callLogData.from_user,
    to_user: callLogData.to_user,
    message: callLogData.message || undefined,
    image_url: callLogData.image_url || undefined,
    status: callLogData.status || "pending",
    created_at: callLogData.created_at,
    accepted_at: callLogData.accepted_at || undefined,
    rejected_at: callLogData.rejected_at || undefined,
  };

  if (organizationId) {
    const roomName = `organization_${organizationId}`;
    io.to(roomName).emit("callLogCreated", fullCallLogData);
  } else {
    io.emit("callLogCreated", fullCallLogData);
  }


  emittedCallLogs.set(callLogId, Date.now());

 
  setTimeout(() => {
    emittedCallLogs.delete(callLogId);
  }, 5000);
};

export const emitCallLogUpdated = (callLogData: any, organizationId?: number | null) => {
  if (!io) return;
  
  const callLogId = callLogData.id?.toString();
  if (!callLogId) return;

  const lastEmitted = emittedCallLogs.get(callLogId);
  if (lastEmitted && Date.now() - lastEmitted < 1000) {
    return;
  }

  const fullCallLogData = {
    id: callLogData.id,
    call_id: callLogData.call_id,
    from_user: callLogData.from_user,
    to_user: callLogData.to_user,
    message: callLogData.message || undefined,
    image_url: callLogData.image_url || undefined,
    status: callLogData.status,
    created_at: callLogData.created_at,
    accepted_at: callLogData.accepted_at || undefined,
    rejected_at: callLogData.rejected_at || undefined,
  };

  if (organizationId) {
    const roomName = `organization_${organizationId}`;
    io.to(roomName).emit("callLogUpdated", fullCallLogData);
  } else {
    io.emit("callLogUpdated", fullCallLogData);
  }

  emittedCallLogs.set(callLogId, Date.now());

  setTimeout(() => {
    emittedCallLogs.delete(callLogId);
  }, 5000);
};
