import { redirect } from "next/navigation";
import { LoginForm } from "@/app/(diner)/login/LoginForm";
import { auth, isGoogleOAuthConfigured } from "@/lib/auth/config";
import { getDefaultHomeForRole } from "@/lib/auth/rbac";
import { getI18nContext } from "@/lib/i18n/server";

export default async function LoginPage() {
  const [session, { dict }] = await Promise.all([auth(), getI18nContext()]);
  if (session?.user) {
    redirect(getDefaultHomeForRole(session.user.role));
  }

  return (
    <LoginForm
      copy={dict.auth}
      signUpLabel={dict.nav.signUp}
      googleEnabled={isGoogleOAuthConfigured()}
    />
  );
}
