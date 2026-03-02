import crypto from "crypto";
import { prisma } from "../models/db";

export type QrLoginStatus = "pending" | "approved" | "expired";

export type QrLoginUserPayload = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  department_id?: number | null;
  department_name?: string | null;
  organization_id?: number | null;
  organization_name?: string | null;
  is_department_account?: boolean;
  is_admin_view?: boolean;
  is_floor_account?: boolean;
};

export type QrLoginSession = {
  sessionId: string;
  status: QrLoginStatus;
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
  approvedByZaloUserId?: string;
  user?: QrLoginUserPayload;
};

type QrLoginSessionRow = {
  session_id: string;
  status: string;
  created_at: number | string;
  expires_at: number | string;
  approved_at: number | string | null;
  approved_by_zalo_user_id: string | null;
  user_payload: QrLoginUserPayload | null;
  poll_token_hash: string | null;
};

const now = () => Date.now();
let ensured = false;
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const secureEqual = (left: string, right: string) => {
  const l = Buffer.from(left);
  const r = Buffer.from(right);
  if (l.length !== r.length) return false;
  return crypto.timingSafeEqual(l, r);
};

const ensureStore = async () => {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS qr_login_sessions (
      session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      approved_at BIGINT NULL,
      approved_by_zalo_user_id TEXT NULL,
      token TEXT NULL,
      user_payload JSONB NULL,
      poll_token_hash TEXT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE qr_login_sessions ADD COLUMN IF NOT EXISTS poll_token_hash TEXT NULL`
  );
  ensured = true;
};

const mapRow = (row: QrLoginSessionRow): QrLoginSession => ({
  sessionId: row.session_id,
  status: row.status as QrLoginStatus,
  createdAt: Number(row.created_at),
  expiresAt: Number(row.expires_at),
  approvedAt: row.approved_at == null ? undefined : Number(row.approved_at),
  approvedByZaloUserId: row.approved_by_zalo_user_id ?? undefined,
  user: row.user_payload ?? undefined,
});

const getRow = async (sessionId: string): Promise<QrLoginSessionRow | null> => {
  const rows = await prisma.$queryRawUnsafe<QrLoginSessionRow[]>(
    `SELECT * FROM qr_login_sessions WHERE session_id = $1 LIMIT 1`,
    sessionId
  );
  return rows[0] || null;
};

const purgeExpiredSessions = async () => {
  await ensureStore();
  await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE expires_at <= $1`, now());
};

export const createQrLoginSession = async (
  ttlMs = 2 * 60 * 1000
): Promise<{ session: QrLoginSession; pollToken: string }> => {
  await purgeExpiredSessions();
  const sessionId = crypto.randomUUID();
  const pollToken = `${crypto.randomUUID()}${crypto.randomBytes(12).toString("hex")}`;
  const pollTokenHash = hashToken(pollToken);
  const createdAt = now();
  const session: QrLoginSession = {
    sessionId,
    status: "pending",
    createdAt,
    expiresAt: createdAt + ttlMs,
  };
  await prisma.$executeRawUnsafe(
    `INSERT INTO qr_login_sessions (session_id, status, created_at, expires_at, poll_token_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    session.sessionId,
    session.status,
    session.createdAt,
    session.expiresAt,
    pollTokenHash
  );
  return { session, pollToken };
};

export const getQrLoginSession = async (sessionId: string): Promise<QrLoginSession | null> => {
  await purgeExpiredSessions();
  const row = await getRow(sessionId);
  const session = row ? mapRow(row) : null;
  if (!session) return null;
  if (session.expiresAt <= now()) {
    await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE session_id = $1`, sessionId);
    return null;
  }
  return session;
};

export const getQrLoginSessionForPoll = async (
  sessionId: string,
  pollToken: string
): Promise<QrLoginSession | null> => {
  await purgeExpiredSessions();
  const row = await getRow(sessionId);
  if (!row) return null;
  const expectedHash = row.poll_token_hash || "";
  const actualHash = hashToken(pollToken);
  if (!expectedHash || !secureEqual(expectedHash, actualHash)) {
    return null;
  }
  const session = mapRow(row);
  if (session.expiresAt <= now()) {
    await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE session_id = $1`, sessionId);
    return null;
  }
  return session;
};

export const consumeQrLoginSessionApproval = async (
  sessionId: string,
  pollToken: string
): Promise<QrLoginSession | null> => {
  const session = await getQrLoginSessionForPoll(sessionId, pollToken);
  if (!session) return null;
  if (session.status !== "approved" || !session.user) return null;
  await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE session_id = $1`, sessionId);
  return session;
};

export const approveQrLoginSession = async (
  sessionId: string,
  payload: {
    user: QrLoginUserPayload;
    zaloUserId: string;
  }
): Promise<QrLoginSession | null> => {
  await purgeExpiredSessions();
  const session = await getQrLoginSession(sessionId);
  if (!session) return null;
  if (session.expiresAt <= now()) {
    await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE session_id = $1`, sessionId);
    return null;
  }

  const approved: QrLoginSession = {
    ...session,
    status: "approved",
    approvedAt: now(),
    approvedByZaloUserId: payload.zaloUserId,
    user: payload.user,
  };
  await prisma.$executeRawUnsafe(
    `UPDATE qr_login_sessions
     SET status = $2,
         approved_at = $3,
         approved_by_zalo_user_id = $4,
         user_payload = $5::jsonb
     WHERE session_id = $1`,
    sessionId,
    approved.status,
    approved.approvedAt ?? null,
    approved.approvedByZaloUserId ?? null,
    JSON.stringify(approved.user ?? null)
  );
  return approved;
};

export const expireQrLoginSession = async (sessionId: string) => {
  await ensureStore();
  await prisma.$executeRawUnsafe(`DELETE FROM qr_login_sessions WHERE session_id = $1`, sessionId);
};

