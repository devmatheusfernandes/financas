import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { householdMembers, households, user } from "@/db/schema";
import { requireHousehold } from "@/lib/session";
import { aiEnabled, audioEnabled } from "@/server/ai";
import { SettingsClient } from "./settings-client";

export default async function AjustesPage() {
  const h = await requireHousehold();
  const [hh] = await db.select({ token: households.inviteToken }).from(households).where(eq(households.id, h.householdId));
  const members = await db
    .select({ name: user.name, email: user.email, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(user, eq(user.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, h.householdId));
  const hd = await headers();
  const host = hd.get("x-forwarded-host") ?? hd.get("host") ?? "localhost:3000";
  const proto = hd.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || `${proto}://${host}`;

  return (
    <SettingsClient
      householdName={h.householdName}
      inviteUrl={`${origin}/convite/${hh.token}`}
      members={members}
      userName={h.userName}
      ai={aiEnabled()}
      audio={audioEnabled()}
    />
  );
}
