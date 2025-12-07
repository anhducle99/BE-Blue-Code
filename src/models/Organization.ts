import { prisma } from "./db.js";

export interface IOrganization {
  id?: number;
  name: string;
  created_at?: Date;
  urlLogo?: string;
}

export class OrganizationModel {
  static async findAll(): Promise<IOrganization[]> {
    const organizations = await prisma.organization.findMany({
      orderBy: { id: "asc" },
    });

    return organizations.map((o: any) => ({
      id: o.id,
      name: o.name,
      created_at: o.createdAt,
      urlLogo: o.urlLogo || undefined,
    }));
  }

  static async findById(id: number): Promise<IOrganization | null> {
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) return null;

    return {
      id: organization.id,
      name: organization.name,
      created_at: organization.createdAt,
      urlLogo: organization.urlLogo || undefined,
    };
  }

  static async create(name: string, urlLogo?: string): Promise<IOrganization> {
    const created = await prisma.organization.create({
      data: {
        name,
        urlLogo: urlLogo || null,
      },
    });

    return {
      id: created.id,
      name: created.name,
      created_at: created.createdAt,
      urlLogo: created.urlLogo || undefined,
    };
  }

  static async update(
    id: number,
    name: string,
    urlLogo?: string
  ): Promise<IOrganization | null> {
    const updated = await prisma.organization.update({
      where: { id },
      data: {
        name,
        urlLogo: urlLogo || null,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      created_at: updated.createdAt,
      urlLogo: updated.urlLogo || undefined,
    };
  }

  static async delete(id: number): Promise<void> {
    await prisma.organization.delete({
      where: { id },
    });
  }
}
