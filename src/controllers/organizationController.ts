import { Request, Response } from "express";
import { OrganizationModel } from "../models/Organization";
import { UserModel } from "../models/User";

const getRequesterScope = async (req: Request) => {
  const jwtUser = (req as any).user;
  const isSuperAdmin = jwtUser?.role === "SuperAdmin";
  if (isSuperAdmin) {
    return { isSuperAdmin: true, organizationId: null as number | null };
  }

  if (!jwtUser?.id) {
    return { isSuperAdmin: false, organizationId: null as number | null };
  }

  const user = await UserModel.findById(Number(jwtUser.id));
  return {
    isSuperAdmin: false,
    organizationId: user?.organization_id ?? null,
  };
};

export const getOrganizations = async (req: Request, res: Response) => {
  try {
    const scope = await getRequesterScope(req);
    const organizationId = scope.isSuperAdmin ? undefined : scope.organizationId ?? undefined;
    const orgs = await OrganizationModel.findAll(organizationId);
    res.json({ success: true, data: orgs });
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch organizations" });
  }
};

export const getOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid organization id" });
  }

  const scope = await getRequesterScope(req);
  if (!scope.isSuperAdmin && scope.organizationId !== id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const org = await OrganizationModel.findById(id);
  if (!org)
    return res
      .status(404)
      .json({ success: false, message: "Organization not found" });
  res.json({ success: true, data: org });
};

export const createOrganization = async (req: Request, res: Response) => {
  const { name, urlLogo } = req.body;
  const org = await OrganizationModel.create(name, urlLogo);
  res.status(201).json({ success: true, data: org });
};

export const updateOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid organization id" });
  }

  const scope = await getRequesterScope(req);
  if (!scope.isSuperAdmin && scope.organizationId !== id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { name, urlLogo } = req.body;
  const updated = await OrganizationModel.update(id, name, urlLogo);
  if (!updated)
    return res
      .status(404)
      .json({ success: false, message: "Organization not found" });
  res.json({ success: true, data: updated });
};

export const deleteOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid organization id" });
  }

  const scope = await getRequesterScope(req);
  if (!scope.isSuperAdmin && scope.organizationId !== id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  await OrganizationModel.delete(id);
  res.json({ success: true, message: "Organization deleted" });
};
