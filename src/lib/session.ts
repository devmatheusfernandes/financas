import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { householdMembers, households } from "@/db/schema";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s.user;
}

export const getMembership = cache(async (userId: string) => {
  const rows = await db
    .select({ householdId: householdMembers.householdId, role: householdMembers.role, name: households.name })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
});

/** Usado por páginas e Server Actions: garante login + household. */
export async function requireHousehold() {
  const u = await requireUser();
  const m = await getMembership(u.id);
  if (!m) redirect("/onboarding");
  return { userId: u.id, userName: u.name, householdId: m.householdId, householdName: m.name, role: m.role };
}
