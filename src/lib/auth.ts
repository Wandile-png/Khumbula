import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
};

type StaffSession = { kind: "staff"; staffId: string; tenantId: string; role: string; email: string };
type MemberSession = { kind: "member"; memberId: string; tenantId: string };

const COOKIE = { staff: "kh_staff", member: "kh_member" } as const;

async function sign(payload: StaffSession | MemberSession, hours: number) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret());
}

async function read<T>(name: string): Promise<T | null> {
  const token = cookies().get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as T;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, hours: number) {
  cookies().set(name, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: hours * 3600 });
}

export async function startStaffSession(s: Omit<StaffSession, "kind">) {
  setCookie(COOKIE.staff, await sign({ kind: "staff", ...s }, 12), 12);
}
export async function startMemberSession(s: Omit<MemberSession, "kind">) {
  setCookie(COOKIE.member, await sign({ kind: "member", ...s }, 2), 2);
}
export function endSession(kind: "staff" | "member") {
  cookies().delete(COOKIE[kind]);
}

export async function getStaff(tenantId: string) {
  const s = await read<StaffSession>(COOKIE.staff);
  if (!s || s.tenantId !== tenantId) return null;
  // Look the person up each time, so a removed user or a changed role takes effect straight away.
  const u = await db.staffUser.findUnique({ where: { id: s.staffId }, select: { active: true, role: true, email: true } });
  if (!u || !u.active) return null;
  return { ...s, role: u.role, email: u.email };
}
export async function getMember(tenantId: string) {
  const s = await read<MemberSession>(COOKIE.member);
  return s && s.tenantId === tenantId ? s : null;
}

export async function requireStaff(tenantId: string, slug: string, roles?: string[]) {
  const s = await getStaff(tenantId);
  if (!s) redirect(`/${slug}/admin/login`);
  if (roles && !roles.includes(s.role)) redirect(`/${slug}/admin?denied=1`);
  return s;
}
export async function requireMember(tenantId: string, slug: string) {
  const s = await getMember(tenantId);
  if (!s) redirect(`/${slug}/portal/login`);
  return s;
}

/** Short-lived signed links (e.g. the post-signup payment page) so policy IDs can't be guessed. */
export async function signLink(data: Record<string, string>, minutes = 60) {
  return new SignJWT(data).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${minutes}m`).sign(secret());
}
export async function readLink<T extends Record<string, string>>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as T;
  } catch {
    return null;
  }
}
