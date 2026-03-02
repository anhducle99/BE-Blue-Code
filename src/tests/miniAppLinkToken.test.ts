import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../models/db", () => ({
  prisma: prismaMock,
}));

vi.mock("../models/CallLog", () => ({
  CallLogModel: {},
}));

vi.mock("../socketStore", () => ({
  getIO: () => ({ to: () => ({ emit: vi.fn() }), emit: vi.fn() }),
  emitCallLogUpdated: vi.fn(),
}));

import miniAppRoutes from "../routes/miniAppRoutes";
import axios from "axios";

describe("mini app link-token flow", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mini", miniAppRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links successfully and returns session token", async () => {
    const linkToken = jwt.sign(
      { userId: 11, type: "mini_link_bind" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "10m" }
    );

    vi.spyOn(axios, "get").mockResolvedValue({
      data: { id: "zalo_abc_123", name: "Zalo User" },
    } as any);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 11,
      name: "Dept A",
      email: "depta@test.local",
      role: "User",
      organizationId: 1,
      departmentId: 2,
      isDepartmentAccount: true,
      isFloorAccount: false,
      zaloUserId: null,
      zaloVerified: false,
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({
      id: 11,
      name: "Dept A",
      email: "depta@test.local",
      role: "User",
      organizationId: 1,
      departmentId: 2,
      isDepartmentAccount: true,
      isFloorAccount: false,
      zaloUserId: "zalo_abc_123",
      zaloVerified: true,
      zaloLinkedAt: new Date(),
    });

    const res = await request(app).post("/api/mini/auth/link").send({
      linkToken,
      zaloAccessToken: "valid-access-token",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body?.data?.token).toBe("string");
    expect(res.body?.data?.user?.id).toBe(11);
  });

  it("rejects expired link token", async () => {
    const expiredToken = jwt.sign(
      { userId: 11, type: "mini_link_bind" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: -1 }
    );

    const res = await request(app).post("/api/mini/auth/link").send({
      linkToken: expiredToken,
      zaloAccessToken: "valid-access-token",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || "")).toContain("Invalid or expired link token");
  });

  it("rejects invalid zalo access token", async () => {
    const linkToken = jwt.sign(
      { userId: 11, type: "mini_link_bind" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "10m" }
    );

    vi.spyOn(axios, "get").mockResolvedValue({
      data: { error: { message: "invalid token" } },
    } as any);

    const res = await request(app).post("/api/mini/auth/link").send({
      linkToken,
      zaloAccessToken: "bad-token",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || "")).toContain("Invalid Zalo access token");
  });
});
