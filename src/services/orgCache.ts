const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { organizationId: number; expiresAt: number };

const cacheByPair = new Map<string, Entry>();
const cacheById = new Map<string, Entry>();

function pairKey(fromUser: string, toUser: string): string {
  const f = String(fromUser).trim().toLowerCase();
  const t = String(toUser).trim().toLowerCase();
  return f && t ? `pair:${f}|${t}` : "";
}

function idKey(identifier: string): string {
  const s = String(identifier).trim().toLowerCase();
  return s ? `id:${s}` : "";
}

export function getCachedOrganizationId(identifier: string): number | null {
  const key = idKey(identifier);
  if (!key) return null;
  const entry = cacheById.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cacheById.delete(key);
    return null;
  }
  return entry.organizationId;
}

export function setCachedOrganizationId(identifier: string, organizationId: number): void {
  const key = idKey(identifier);
  if (!key) return;
  cacheById.set(key, {
    organizationId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function resolveOrganizationId(identifier: string): Promise<number | null> {
  if (!identifier || typeof identifier !== "string") return null;
  const trimmed = identifier.trim();
  const cached = getCachedOrganizationId(trimmed);
  if (cached != null) return cached;

  const { UserModel } = await import("../models/User");
  const { prisma } = await import("../models/db");

  const numId = parseInt(trimmed, 10);
  if (!isNaN(numId) && numId > 0) {
    const user = await UserModel.findById(numId);
    if (user?.organization_id != null) {
      setCachedOrganizationId(trimmed, user.organization_id);
      return user.organization_id;
    }
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { organizationId: true },
  });
  if (user?.organizationId != null) {
    setCachedOrganizationId(trimmed, user.organizationId);
    return user.organizationId;
  }
  return null;
}

export async function getOrganizationIdForCall(fromUser: string, toUser: string): Promise<number | null> {
  const key = pairKey(fromUser, toUser);
  if (key) {
    const entry = cacheByPair.get(key);
    if (entry && Date.now() <= entry.expiresAt) return entry.organizationId;
  }

  const fromOrg = await resolveOrganizationId(fromUser);
  if (fromOrg != null) {
    if (key) {
      cacheByPair.set(key, { organizationId: fromOrg, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return fromOrg;
  }

  const toOrg = await resolveOrganizationId(toUser);
  if (toOrg != null && key) {
    cacheByPair.set(key, { organizationId: toOrg, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return toOrg;
}
