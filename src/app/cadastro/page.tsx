import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export default async function SignupPage({ searchParams }: PageProps<"/cadastro">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (await getSession()) redirect(next && next.startsWith("/") ? next : "/planilha");
  return <AuthForm mode="signup" next={next} />;
}
