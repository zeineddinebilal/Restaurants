import { redirect } from "next/navigation";
import { RegisterForm } from "@/app/(diner)/register/RegisterForm";
import { auth } from "@/lib/auth/config";
import { getDefaultHomeForRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const [session, { locale, dict }, sp] = await Promise.all([
    auth(),
    getI18nContext(),
    searchParams,
  ]);

  if (session?.user) {
    redirect(getDefaultHomeForRole(session.user.role));
  }

  const initialRole = sp.role === "RESTAURANT_OWNER" ? "RESTAURANT_OWNER" : "DINER";

  return (
    <RegisterForm
      copy={dict.auth}
      signInLabel={dict.nav.signIn}
      locale={locale}
      initialRole={initialRole}
    />
  );
}
