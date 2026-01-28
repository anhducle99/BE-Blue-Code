import { prisma } from "./db";

export interface IDepartment {
  id?: number;
  name: string;
  phone?: string;
  alert_group?: string;
  organization_id?: number;
  organization_name?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class DepartmentModel {
  static async findAll(organizationId?: number): Promise<IDepartment[]> {
    const where: any = {};
    
    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }
    
    const departments = await prisma.department.findMany({
      where,
      orderBy: { id: "asc" },
    });

    const orgIds = departments
      .map((d: any) => d.organizationId)
      .filter((id: any): id is number => id !== null && id !== undefined);
    
    const organizations = orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : [];
    
    const orgMap = new Map(organizations.map((o: any) => [o.id, o.name]));

    return departments.map((d: any) => ({
      id: d.id,
      name: d.name,
      phone: d.phone || undefined,
      alert_group: d.alertGroup || undefined,
      organization_id: d.organizationId || undefined,
      organization_name: d.organizationId ? orgMap.get(d.organizationId) || undefined : undefined,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
    }));
  }

  static async findById(id: number): Promise<IDepartment | null> {
    if (id == null || (typeof id === "number" && isNaN(id))) return null;
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department) return null;

    let organizationName: string | undefined = undefined;
    if ((department as any).organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: (department as any).organizationId },
        select: { name: true },
      });
      organizationName = organization?.name || undefined;
    }

    return {
      id: department.id,
      name: department.name,
      phone: department.phone || undefined,
      alert_group: department.alertGroup || undefined,
      organization_id: (department as any).organizationId || undefined,
      organization_name: organizationName,
      created_at: department.createdAt,
      updated_at: department.updatedAt,
    };
  }

  static async create(dept: Partial<IDepartment>): Promise<IDepartment> {
    const { name, phone, alert_group, organization_id } = dept;

    const created = await prisma.department.create({
      data: {
        name: name!,
        phone,
        alertGroup: alert_group,
        organizationId: organization_id || null,
      } as any,
    });

    let organizationName: string | undefined = undefined;
    if (organization_id) {
      const organization = await prisma.organization.findUnique({
        where: { id: organization_id },
        select: { name: true },
      });
      organizationName = organization?.name || undefined;
    }

    return {
      id: created.id,
      name: created.name,
      phone: created.phone || undefined,
      alert_group: created.alertGroup || undefined,
      organization_id: (created as any).organizationId || undefined,
      organization_name: organizationName,
      created_at: created.createdAt,
      updated_at: created.updatedAt,
    };
  }

  static async update(
    id: number,
    dept: Partial<IDepartment>
  ): Promise<IDepartment | null> {
    try {
      const { name, phone, alert_group, organization_id } = dept;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (alert_group !== undefined) updateData.alertGroup = alert_group;
      if (organization_id !== undefined) {
        updateData.organizationId = organization_id !== null && organization_id !== undefined ? organization_id : null;
      }

      const updated = await prisma.department.update({
        where: { id },
        data: updateData as any,
      });

      let organizationName: string | undefined = undefined;
      const finalOrgId = organization_id !== undefined ? organization_id : (updated as any).organizationId;
      if (finalOrgId) {
        try {
          const organization = await prisma.organization.findUnique({
            where: { id: finalOrgId },
            select: { name: true },
          });
          organizationName = organization?.name || undefined;
        } catch (err) {
        }
      }

      return {
        id: updated.id,
        name: updated.name,
        phone: updated.phone || undefined,
        alert_group: updated.alertGroup || undefined,
        organization_id: (updated as any).organizationId || undefined,
        organization_name: organizationName,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      };
    } catch (err: any) {  
      if (err.message?.includes('Unknown argument') || err.message?.includes('organizationId')) {
        const { name: retryName, phone: retryPhone, alert_group: retryAlertGroup } = dept;
        const updateDataWithoutOrg: any = {};
        if (retryName !== undefined) updateDataWithoutOrg.name = retryName;
        if (retryPhone !== undefined) updateDataWithoutOrg.phone = retryPhone;
        if (retryAlertGroup !== undefined) updateDataWithoutOrg.alertGroup = retryAlertGroup;
        
        const updated = await prisma.department.update({
          where: { id },
          data: updateDataWithoutOrg,
        });
        
        return {
          id: updated.id,
          name: updated.name,
          phone: updated.phone || undefined,
          alert_group: updated.alertGroup || undefined,
          organization_id: undefined,
          organization_name: undefined,
          created_at: updated.createdAt,
          updated_at: updated.updatedAt,
        };
      }
      
      throw err;
    }
  }

  static async delete(id: number): Promise<boolean> {
    try {
      await prisma.history.deleteMany({
        where: {
          OR: [{ departmentFromId: id }, { departmentToId: id }],
        },
      });

      await prisma.department.delete({
        where: { id },
      });

      return true;
    } catch (err) {
      return false;
    }
  }
}
