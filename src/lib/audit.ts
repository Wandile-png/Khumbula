import { Prisma } from "@prisma/client";
import { db } from "./db";

export function audit(tenantId: string, actor: string, action: string, target = "", detail?: Prisma.InputJsonValue) {
  return db.auditLog.create({ data: { tenantId, actor, action, target, detail } }).catch((e) => console.error("audit failed", e));
}
