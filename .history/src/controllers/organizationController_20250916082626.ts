import { Request, Response } from "express";
import { OrganizationModel } from "../models/Organization";

export const getOrganizations = async (req: Request, res: Response) => {
  const orgs = await OrganizationModel.findAll();
  res.json({ success: true, data: orgs });
};

export const getOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const org = await OrganizationModel.findById(id);
  if (!org)
    return res
      .status(404)
      .json({ success: false, message: "Organization not found" });
  res.json({ success: true, data: org });
};

export const createOrganization = async (req: Request, res: Response) => {
  const { name } = req.body;
  const org = await OrganizationModel.create(name);
  res.status(201).json({ success: true, data: org });
};

export const updateOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  const updated = await OrganizationModel.update(id, name);
  if (!updated)
    return res
      .status(404)
      .json({ success: false, message: "Organization not found" });
  res.json({ success: true, data: updated });
};

export const deleteOrganization = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await OrganizationModel.delete(id);
  res.json({ success: true, message: "Organization deleted" });
};
