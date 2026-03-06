import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../models/db";

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
    const userRole = (req as any).user?.role;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);
    const queryOrgId = req.query.organization_id as string | undefined;
    let organizationId: number | null = null;

    if (userRole === "SuperAdmin" && queryOrgId) {
      const parsed = parseInt(queryOrgId, 10);
      organizationId = !isNaN(parsed) ? parsed : null;
    } else if (userRole !== "SuperAdmin") {
      if (!user || !user.organization_id) {
        return res.status(403).json({
          success: false,
          message: "User không thuộc organization nào",
        });
      }
      organizationId = user.organization_id;
    }

    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    let departments: any[] = [];
    
    const deptWhere = organizationId != null ? { organizationId } : {};
    try {
      departments = await prisma.department.findMany({
        where: deptWhere as any,
        orderBy: { id: "asc" },
      });
    } catch (err: any) {
    }

    if (departments.length === 0 && organizationId != null) {
      const orgUsersForDepts = await prisma.user.findMany({
        where: { organizationId },
        select: { departmentId: true, name: true },
      });

      const orgDepartmentIds = Array.from(
        new Set(
          orgUsersForDepts
            .map((u: { departmentId: number | null }) => u.departmentId)
            .filter((id: number | null): id is number => id !== null)
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
    
    const orgUsersWhere = organizationId != null ? { organizationId } : {};
    const orgUsers = await prisma.user.findMany({
      where: orgUsersWhere as any,
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

    const orgUserNames = orgUsers.map((u: { name: string }) => u.name);
    const orgDeptNames = departments.map((d: { name: string }) => d.name);
    const allOrgIdentifiers = [...orgUserNames, ...orgDeptNames];

    type AggRow = { fromUser: string; toUser: string; status: string; cnt: number; acceptedCnt: number };
    let aggregated: AggRow[] = [];
    if (organizationId != null && allOrgIdentifiers.length > 0) {
      aggregated = await prisma.$queryRaw<AggRow[]>`
        SELECT from_user as "fromUser", to_user as "toUser", status,
          COUNT(*)::int as cnt,
          SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END)::int as "acceptedCnt"
        FROM call_logs
        WHERE created_at >= ${new Date(start)}::timestamptz
          AND created_at <= ${new Date(end)}::timestamptz
          AND (
            lower(trim(from_user)) IN (SELECT lower(trim(name)) FROM users WHERE organization_id = ${organizationId})
            OR lower(trim(to_user)) IN (SELECT lower(trim(name)) FROM users WHERE organization_id = ${organizationId})
            OR lower(trim(from_user)) IN (SELECT lower(trim(name)) FROM departments WHERE organization_id = ${organizationId})
            OR lower(trim(to_user)) IN (SELECT lower(trim(name)) FROM departments WHERE organization_id = ${organizationId})
          )
        GROUP BY from_user, to_user, status
      `;
    } else if (organizationId == null && allOrgIdentifiers.length > 0) {
      const lowerIds = allOrgIdentifiers.map((id) => id.toLowerCase().trim());
      aggregated = await prisma.$queryRaw<AggRow[]>`
        SELECT from_user as "fromUser", to_user as "toUser", status,
          COUNT(*)::int as cnt,
          SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END)::int as "acceptedCnt"
        FROM call_logs
        WHERE created_at >= ${new Date(start)}::timestamptz
          AND created_at <= ${new Date(end)}::timestamptz
          AND (lower(trim(from_user)) IN (${Prisma.join(lowerIds)})
               OR lower(trim(to_user)) IN (${Prisma.join(lowerIds)}))
        GROUP BY from_user, to_user, status
      `;
    }

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
    
    type UserRow = { name: string; email?: string | null; departmentId?: number | null; isFloorAccount?: boolean | null };
    allUsers.forEach((user: UserRow) => {
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

    type LookupResult = { user: UserRow | null; department: any | null };
    const lookupCache = new Map<string, LookupResult>();
    const findUserOrDept = (identifier: string) => {
      const key = identifier.toLowerCase().trim();
      const cached = lookupCache.get(key);
      if (cached) return cached;
      
      let user = userByNameMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) || null : null;
        const result: LookupResult = { user, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      user = userByEmailMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) || null : null;
        const result: LookupResult = { user, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      const dept = deptByNameMap.get(key);
      if (dept) {
        const deptUsers = usersByDeptMap.get(dept.id) || [];
        const floorAccountUser = deptUsers.find(u => u.isFloorAccount === true);
        const nonFloorAccountUser = deptUsers.find(u => !u.isFloorAccount);
        const deptUser = floorAccountUser || nonFloorAccountUser || deptUsers[0];
        const result: LookupResult = { user: deptUser || null, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      const result: LookupResult = { user: null, department: null };
      lookupCache.set(key, result);
      return result;
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
    
    type CallLogRow = { fromUser: string; toUser: string; status: string; cnt: number; acceptedCnt: number };
    aggregated.forEach((row: CallLogRow) => {
      const senderInfo = findUserOrDept(row.fromUser);
      const receiverInfo = findUserOrDept(row.toUser);
      
      const senderUser = senderInfo.user;
      const receiverUser = receiverInfo.user;
      const receiverDept = receiverInfo.department;

      if (
        senderUser &&
        senderUser.isFloorAccount === true &&
        receiverDept &&
        deptMap[receiverDept.id]
      ) {
        const deptId = receiverDept.id;
        deptMap[deptId].sent += row.cnt;
      }

      if (
        receiverDept &&
        deptMap[receiverDept.id] &&
        receiverUser &&
        receiverUser.isFloorAccount !== true &&
        receiverUser.departmentId === receiverDept.id
      ) {
        const deptId = receiverDept.id;
        if (row.status === "accepted") {
          deptMap[deptId].received += row.cnt;
        } else if (row.acceptedCnt > 0) {
          deptMap[deptId].received += row.acceptedCnt;
        }
      }
    });

    const deptStats = Object.values(deptMap);
    
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
    const userRole = (req as any).user?.role;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy thông tin người dùng",
      });
    }

    const { UserModel } = await import("../models/User");
    const user = await UserModel.findById(userId);
    const queryOrgId = req.query.organization_id as string | undefined;
    let organizationId: number | null = null;

    if (userRole === "SuperAdmin" && queryOrgId) {
      const parsed = parseInt(queryOrgId, 10);
      organizationId = !isNaN(parsed) ? parsed : null;
    } else if (userRole !== "SuperAdmin") {
      if (!user || !user.organization_id) {
        return res.status(403).json({
          success: false,
          message: "User không thuộc organization nào",
        });
      }
      organizationId = user.organization_id;
    }

    const { start, end } = getUTCDateRangeVN(
      startDate as string,
      endDate as string
    );

    let departments: any[] = [];
    
    const groupDeptWhere = organizationId != null ? { organizationId } : {};
    try {
      departments = await prisma.department.findMany({
        where: groupDeptWhere as any,
        orderBy: { id: "asc" },
      });
    } catch (err) {
    }

    if (departments.length === 0 && organizationId != null) {
      const orgUsersForDepts = await prisma.user.findMany({
        where: { organizationId },
        select: { departmentId: true },
      });
      
      const orgDepartmentIds = Array.from(
        new Set(
          orgUsersForDepts
            .map((u: { departmentId: number | null }) => u.departmentId)
            .filter((id: number | null): id is number => id !== null)
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

    const groupOrgUsersWhere = organizationId != null ? { organizationId } : {};
    const orgUsers = await prisma.user.findMany({
      where: groupOrgUsersWhere as any,
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

    const orgUserNames = orgUsers.map((u: { name: string }) => u.name);
    const orgDeptNames = departments.map((d: { name: string }) => d.name);
    const allOrgIdentifiers = [...orgUserNames, ...orgDeptNames];

    type AggRowGroup = { fromUser: string; toUser: string; status: string; cnt: number; acceptedCnt: number };
    let aggregated: AggRowGroup[] = [];
    if (organizationId != null && allOrgIdentifiers.length > 0) {
      aggregated = await prisma.$queryRaw<AggRowGroup[]>`
        SELECT from_user as "fromUser", to_user as "toUser", status,
          COUNT(*)::int as cnt,
          SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END)::int as "acceptedCnt"
        FROM call_logs
        WHERE created_at >= ${new Date(start)}::timestamptz
          AND created_at <= ${new Date(end)}::timestamptz
          AND (
            lower(trim(from_user)) IN (SELECT lower(trim(name)) FROM users WHERE organization_id = ${organizationId})
            OR lower(trim(to_user)) IN (SELECT lower(trim(name)) FROM users WHERE organization_id = ${organizationId})
            OR lower(trim(from_user)) IN (SELECT lower(trim(name)) FROM departments WHERE organization_id = ${organizationId})
            OR lower(trim(to_user)) IN (SELECT lower(trim(name)) FROM departments WHERE organization_id = ${organizationId})
          )
        GROUP BY from_user, to_user, status
      `;
    } else if (organizationId == null && allOrgIdentifiers.length > 0) {
      const lowerIds = allOrgIdentifiers.map((id) => id.toLowerCase().trim());
      aggregated = await prisma.$queryRaw<AggRowGroup[]>`
        SELECT from_user as "fromUser", to_user as "toUser", status,
          COUNT(*)::int as cnt,
          SUM(CASE WHEN accepted_at IS NOT NULL THEN 1 ELSE 0 END)::int as "acceptedCnt"
        FROM call_logs
        WHERE created_at >= ${new Date(start)}::timestamptz
          AND created_at <= ${new Date(end)}::timestamptz
          AND (lower(trim(from_user)) IN (${Prisma.join(lowerIds)})
               OR lower(trim(to_user)) IN (${Prisma.join(lowerIds)}))
        GROUP BY from_user, to_user, status
      `;
    }

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

    type UserRowGroup = { name: string; email?: string | null; departmentId?: number | null; isFloorAccount?: boolean | null };
    allUsers.forEach((user: UserRowGroup) => {
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

    type LookupResultGroup = { user: UserRowGroup | null; department: any | null };
    const lookupCache = new Map<string, LookupResultGroup>();
    const findUserOrDept = (identifier: string) => {
      const key = identifier.toLowerCase().trim();
      const cached = lookupCache.get(key);
      if (cached) return cached;
      
      let user = userByNameMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) : null;
        const result: LookupResultGroup = { user, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      user = userByEmailMap.get(key);
      if (user) {
        const dept = user.departmentId ? deptByIdMap.get(user.departmentId) : null;
        const result: LookupResultGroup = { user, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      const dept = deptByNameMap.get(key);
      if (dept) {
        const deptUsers = usersByDeptMap.get(dept.id) || [];
        const floorAccountUser = deptUsers.find(u => u.isFloorAccount === true);
        const nonFloorAccountUser = deptUsers.find(u => !u.isFloorAccount);
        const deptUser = floorAccountUser || nonFloorAccountUser || deptUsers[0];
        const result: LookupResultGroup = { user: deptUser || null, department: dept };
        lookupCache.set(key, result);
        return result;
      }
      
      const result: LookupResultGroup = { user: null, department: null };
      lookupCache.set(key, result);
      return result;
    };

    const groupMap: Record<string, { sent: number; received: number }> = {};
    departments.forEach((dept: any) => {
      const deptName = dept.name.trim();
      if (!groupMap[deptName]) {
        groupMap[deptName] = { sent: 0, received: 0 };
      }
    });
    const orgDeptIdsSet = new Set(departments.map((d: any) => d.id));
    type CallLogRowGroup = { fromUser: string; toUser: string; status: string; cnt: number; acceptedCnt: number };
    aggregated.forEach((row: CallLogRowGroup) => {
      const senderInfo = findUserOrDept(row.fromUser);
      const receiverInfo = findUserOrDept(row.toUser);
      
      const senderUser = senderInfo.user;
      const receiverUser = receiverInfo.user;
      const receiverDept = receiverInfo.department;

      if (!receiverDept || !orgDeptIdsSet.has(receiverDept.id)) {
        return;
      }

      const groupName = receiverDept.name.trim();
      if (!groupMap[groupName]) {
        groupMap[groupName] = { sent: 0, received: 0 };
      }

      if (senderUser && senderUser.isFloorAccount === true) {
        groupMap[groupName].sent += row.cnt;
      }

      if (
        receiverUser &&
        receiverUser.isFloorAccount !== true &&
        receiverUser.departmentId === receiverDept.id
      ) {
        if (row.status === "accepted") {
          groupMap[groupName].received += row.cnt;
        } else if (row.acceptedCnt > 0) {
          groupMap[groupName].received += row.acceptedCnt;
        }
      }
    });

    const groupStats = Object.entries(groupMap)
      .map(([label, counts]) => ({
        label,
        sent: counts.sent,
        received: counts.received,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return res.json(groupStats);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
