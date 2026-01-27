import { Request, Response } from "express";
import { prisma } from "../models/db";
import { CallLogModel } from "../models/CallLog";

function getUTCDateRangeVN(startStr: string, endStr: string) {
  let start = new Date(startStr);
  let end = new Date(endStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("startDate hoặc endDate không hợp lệ");
  }

  if (start > end) [start, end] = [end, start];

  const offset = 7 * 60;
  const startVN = new Date(start.getTime() + offset * 60 * 1000);
  const endVN = new Date(end.getTime() + offset * 60 * 1000);

  startVN.setHours(0, 0, 0, 0);
  endVN.setHours(23, 59, 59, 999);

  const startUTC = new Date(startVN.getTime() - offset * 60 * 1000);
  const endUTC = new Date(endVN.getTime() - offset * 60 * 1000);

  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

export const getDepartmentStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate và endDate là bắt buộc",
    });
  }

  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);
    if (!user || !user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào",
      });
    }

    const organizationId = user.organization_id;

    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    let departments: any[] = [];
    
    const allDepartmentsInDB = await prisma.department.findMany({
      orderBy: { id: "asc" },
    });
    allDepartmentsInDB.forEach((d: any) => {
    });
    
    try {
      departments = await prisma.department.findMany({
        where: {
          organizationId: organizationId, 
        } as any,  
        orderBy: { id: "asc" },
      });
    } catch (err: any) {
    }

    if (departments.length === 0) {
      const orgUsersForDepts = await prisma.user.findMany({
        where: { organizationId },
        select: { departmentId: true, name: true },
      });
        orgUsersForDepts.forEach((u: any) => {
      });
      
      const orgDepartmentIds = Array.from(
        new Set(
          orgUsersForDepts
            .map((u) => u.departmentId)
            .filter((id): id is number => id !== null)
        )
      );
            
      if (orgDepartmentIds.length > 0) {
        departments = await prisma.department.findMany({
          where: {
            id: { in: orgDepartmentIds },
          },
          orderBy: { id: "asc" },
        });
      } else {
        departments = await prisma.department.findMany({
          orderBy: { id: "asc" },
        });
      }
    }
    
    departments.forEach((d: any) => {
    });

    const orgUsers = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        departmentId: true,
        department: {
          select: {
            name: true,
          },
        },
        isFloorAccount: true,
      },
    });

    const orgUserNames = orgUsers.map((u) => u.name);
    const orgDeptNames = departments.map((d) => d.name);
    const allOrgIdentifiers = [...orgUserNames, ...orgDeptNames];

    const logs = await prisma.callLog.findMany({
      where: {
        OR: [
          { fromUser: { in: allOrgIdentifiers } },
          { toUser: { in: allOrgIdentifiers } },
        ],
        createdAt: {
          gte: new Date(start),
          lte: new Date(end),
        },
      },
    });

    const allUsers = orgUsers;

    const userByNameMap = new Map<string, any>();
    const userByEmailMap = new Map<string, any>();
    const deptByIdMap = new Map<number, any>();
    const deptByNameMap = new Map<string, any>();
    const usersByDeptMap = new Map<number, any[]>();
    
    departments.forEach((dept: any) => {
      deptByIdMap.set(dept.id, dept);
      deptByNameMap.set(dept.name.toLowerCase().trim(), dept);
    });
    
    allUsers.forEach((user) => {
      userByNameMap.set(user.name.toLowerCase().trim(), user);
      if (user.email) {
        userByEmailMap.set(user.email.toLowerCase().trim(), user);
      }
      if (user.departmentId) {
        if (!usersByDeptMap.has(user.departmentId)) {
          usersByDeptMap.set(user.departmentId, []);
        }
        usersByDeptMap.get(user.departmentId)!.push(user);
      }
    });

    const findUserOrDept = (identifier: string) => {
      const key = identifier.toLowerCase().trim();
      
      let user = userByNameMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) || null : null;
        return { user, department: dept };
      }
      
      user = userByEmailMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) || null : null;
        return { user, department: dept };
      }
      
      const dept = deptByNameMap.get(key);
      if (dept) {
        const deptUsers = usersByDeptMap.get(dept.id) || [];
        const floorAccountUser = deptUsers.find(u => u.isFloorAccount === true);
        const nonFloorAccountUser = deptUsers.find(u => !u.isFloorAccount);
        const deptUser = floorAccountUser || nonFloorAccountUser || deptUsers[0];
        return { user: deptUser || null, department: dept };
      }
      
      return { user: null, department: null };
    };

    const deptMap: Record<number, any> = {};
    departments.forEach((d: any) => {
      deptMap[d.id] = {
        id: d.id,
        name: d.name,
        alert_group: d.alertGroup,
        sent: 0,
        received: 0,
      };
    });
    
    if (departments.length > 0) {
      departments.slice(0, 5).forEach((d: any) => {
      });
    }
    
    if (allUsers.length > 0) {
      allUsers.slice(0, 10).forEach((u: any) => {
      });
    }
    
    if (logs.length > 0) {
      logs.slice(0, 10).forEach((log: any, idx: number) => {
      });
    }
    
    let processedCount = 0;
    let sentCount = 0;
    let receivedCount = 0;
    let skippedNoSender = 0;
    let skippedNoReceiver = 0;
    let skippedSenderNotFloor = 0;
    let skippedNoReceiverDept = 0;
    let skippedNotAccepted = 0;
    let skippedReceiverIsFloor = 0;
    
    logs.forEach((log, index) => {
      const senderInfo = findUserOrDept(log.fromUser);
      const receiverInfo = findUserOrDept(log.toUser);
      
      const senderUser = senderInfo.user;
      const receiverUser = receiverInfo.user;
      const receiverDept = receiverInfo.department;

      if (index < 10) {
        if (senderUser) {
        } else {
        }
        if (receiverUser) {
        }
        if (receiverDept) {
        } else {
        }
      }

    
      if (!senderUser) {
        skippedNoSender++;
      } else if (senderUser.isFloorAccount !== true) {
        skippedSenderNotFloor++;
      } else if (!receiverDept) {
        skippedNoReceiverDept++;
      } else if (!deptMap[receiverDept.id]) {
        skippedNoReceiverDept++;
      } else {
        const deptId = receiverDept.id;
        deptMap[deptId].sent += 1;
        sentCount++;
      }

      if (!receiverDept) {
        skippedNoReceiver++;
      } else if (!deptMap[receiverDept.id]) {
        skippedNoReceiver++;
      } else if (log.status !== "accepted" && log.acceptedAt === null) {
        skippedNotAccepted++;
      } else if (!receiverUser) {
        skippedNoReceiver++;
      } else if (receiverUser.isFloorAccount === true) {
        skippedReceiverIsFloor++;
      } else if (receiverUser.departmentId !== receiverDept.id) {
        skippedNoReceiver++;
      } else {
        const deptId = receiverDept.id;
        deptMap[deptId].received += 1;
        receivedCount++;
      }
      
      processedCount++;
    });

    const deptStats = Object.values(deptMap);
    deptStats.forEach((dept: any) => {
    });
    
    return res.json(deptStats);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getGroupStats = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "startDate và endDate là bắt buộc",
    });
  }

  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);
    if (!user || !user.organization_id) {
      return res.status(403).json({
        success: false,
        message: "User không thuộc organization nào",
      });
    }

    const organizationId = user.organization_id;

    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const organizationName = organization?.name || `Organization ${organizationId}`;
    let departments: any[] = [];
    
    try {
      departments = await prisma.department.findMany({
        where: {
          organizationId: organizationId,
        } as any,
        orderBy: { id: "asc" },
      });
    } catch (err) {
    }

    if (departments.length === 0) {
      const orgUsersForDepts = await prisma.user.findMany({
        where: { organizationId },
        select: { departmentId: true },
      });
      
      const orgDepartmentIds = Array.from(
        new Set(
          orgUsersForDepts
            .map((u) => u.departmentId)
            .filter((id): id is number => id !== null)
        )
      );
      
      if (orgDepartmentIds.length > 0) {
        departments = await prisma.department.findMany({
          where: {
            id: { in: orgDepartmentIds },
          },
          orderBy: { id: "asc" },
        });
      }
    }

    const orgUsers = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        departmentId: true,
        department: {
          select: {
            name: true,
          },
        },
        isFloorAccount: true,
      },
    });

    const orgUserNames = orgUsers.map((u) => u.name);
    const orgDeptNames = departments.map((d) => d.name);
    const allOrgIdentifiers = [...orgUserNames, ...orgDeptNames];

    const logs = await prisma.callLog.findMany({
      where: {
        OR: [
          { fromUser: { in: allOrgIdentifiers } },
          { toUser: { in: allOrgIdentifiers } },
        ],
        createdAt: {
          gte: new Date(start),
          lte: new Date(end),
        },
      },
    });

    const allUsers = orgUsers;
    const userByNameMap = new Map<string, any>();
    const userByEmailMap = new Map<string, any>();
    const deptByIdMap = new Map<number, any>();
    const deptByNameMap = new Map<string, any>();
    const usersByDeptMap = new Map<number, any[]>();
    
    departments.forEach((dept: any) => {
      deptByIdMap.set(dept.id, dept);
      deptByNameMap.set(dept.name.toLowerCase().trim(), dept);
    });

    allUsers.forEach((user) => {
      userByNameMap.set(user.name.toLowerCase().trim(), user);
      if (user.email) {
        userByEmailMap.set(user.email.toLowerCase().trim(), user);
      }
      if (user.departmentId) {
        if (!usersByDeptMap.has(user.departmentId)) {
          usersByDeptMap.set(user.departmentId, []);
        }
        usersByDeptMap.get(user.departmentId)!.push(user);
      }
    });

    const findUserOrDept = (identifier: string) => {
      const key = identifier.toLowerCase().trim();
      
      let user = userByNameMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) : null;
        return { user, department: dept };
      }
      
      user = userByEmailMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) : null;
        return { user, department: dept };
      }
      
      const dept = deptByNameMap.get(key);
      if (dept) {
        const deptUsers = usersByDeptMap.get(dept.id) || [];
        const floorAccountUser = deptUsers.find(u => u.isFloorAccount === true);
        const nonFloorAccountUser = deptUsers.find(u => !u.isFloorAccount);
        const deptUser = floorAccountUser || nonFloorAccountUser || deptUsers[0];
        return { user: deptUser || null, department: dept };
      }
      
      return { user: null, department: null };
    };

    const groupMap: Record<string, { sent: number; received: number }> = {};
    departments.forEach((dept: any) => {
      const deptName = dept.name.trim();
      if (!groupMap[deptName]) {
        groupMap[deptName] = { sent: 0, received: 0 };
      }
    });
    const orgDeptIdsSet = new Set(departments.map((d: any) => d.id));
    if (departments.length > 0) {
      departments.slice(0, 5).forEach((d: any) => {
      });
    }
    
    if (logs.length > 0) {
      logs.slice(0, 10).forEach((log: any, idx: number) => {
      });
    }
    
    let processedCount = 0;
    let sentCount = 0;
    let receivedCount = 0;
    let skippedNoReceiverDept = 0;
    let skippedNoSender = 0;
    let skippedSenderNotFloor = 0;
    let skippedNoReceiver = 0;
    let skippedNotAccepted = 0;
    let skippedReceiverIsFloor = 0;
    
    logs.forEach((log, index) => {
      const senderInfo = findUserOrDept(log.fromUser);
      const receiverInfo = findUserOrDept(log.toUser);
      
      const senderUser = senderInfo.user;
      const receiverUser = receiverInfo.user;
      const receiverDept = receiverInfo.department;

      if (!receiverDept || !orgDeptIdsSet.has(receiverDept.id)) {
        skippedNoReceiverDept++;
        processedCount++;
        return;
      }

      const groupName = receiverDept.name.trim();
      if (!groupMap[groupName]) {
        groupMap[groupName] = { sent: 0, received: 0 };
      }

      if (index < 10) {
        if (senderUser) {
        } else {
        }
        if (receiverDept) {
        } else {
        }
        if (receiverUser) {
        }
      }

      if (!senderUser) {
        skippedNoSender++;
      } else if (senderUser.isFloorAccount !== true) {
        skippedSenderNotFloor++;
      } else {
        groupMap[groupName].sent += 1;
        sentCount++;
      }

      if (!receiverDept) {
        skippedNoReceiver++;
      } else if (log.status !== "accepted" && log.acceptedAt === null) {
        skippedNotAccepted++;
      } else if (!receiverUser) {
        skippedNoReceiver++;
      } else if (receiverUser.isFloorAccount === true) {
        skippedReceiverIsFloor++;
      } else if (receiverUser.departmentId !== receiverDept.id) {
        skippedNoReceiver++;
      } else {
        groupMap[groupName].received += 1;
        receivedCount++;
      }
      processedCount++;
    });
    
   
    if (Object.keys(groupMap).length > 0) {
    }

    const groupStats = Object.entries(groupMap)
      .map(([label, counts]) => ({
        label,
        sent: counts.sent,
        received: counts.received,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    groupStats.forEach((group: any) => {
    });

    return res.json(groupStats);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
