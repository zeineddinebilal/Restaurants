import { redirect } from "next/navigation";
import { RegisterForm } from "@/app/(diner)/register/RegisterForm";
import { auth } from "@/lib/auth/config";
import { getDefaultHomeForRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18nContext } from "@/lib/i18n/server";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; prospectInvite?: string; returnTo?: string }>;
}) {
  const [session, { locale, dict }, sp] = await Promise.all([
    auth(),
    getI18nContext(),
    searchParams,
  ]);

  if (session?.user) {
    redirect(getDefaultHomeForRole(session.user.role));
  }

  const inviteToken = sp.prospectInvite?.trim() || undefined;
  let invitedRestaurantName: string | null = null;
  if (inviteToken) {
    const prospect = await prisma.prospect.findUnique({
      where: { inviteToken },
      select: { name: true, convertedRestaurantId: true },
    });
    if (prospect && !prospect.convertedRestaurantId) {
      invitedRestaurantName = prospect.name;
    }
  }

  const initialRole =
    sp.role === "RESTAURANT_OWNER" || Boolean(invitedRestaurantName) ? "RESTAURANT_OWNER" : "DINER";

  const safeReturnTo =
    sp.returnTo && sp.returnTo.startsWith("/") && !sp.returnTo.startsWith("//")
      ? sp.returnTo
      : undefined;

  return (
    <RegisterForm
      copy={dict.auth}
      signInLabel={dict.nav.signIn}
      locale={locale}
      initialRole={initialRole}
      prospectInvite={invitedRestaurantName ? inviteToken : undefined}
      invitedRestaurantName={invitedRestaurantName}
      returnTo={safeReturnTo}
    />
  );
}
