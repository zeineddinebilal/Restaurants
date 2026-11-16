import { DinerProfileBuilder } from "@/components/DinerProfileBuilder";
import { getGeminiConfig } from "@/lib/agents/gemini";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { getI18nContext } from "@/lib/i18n/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ locale }, { profile }, sp] = await Promise.all([
    getI18nContext(),
    getActiveDinerProfile(),
    searchParams,
  ]);

  const aiConfigured = getGeminiConfig().configured;
  const isAr = locale === "ar";

  return (
    <DinerProfileBuilder
      locale={locale}
      mode="onboarding"
      initialProfile={profile}
      aiConfigured={aiConfigured}
      returnTo={sp.returnTo}
      heading={isAr ? "إعداد ملفك الغذائي الشخصي" : "Build Your Food Profile"}
      subheading={
        isAr
          ? "حدّد حساسيتك الغذائية وتفضيلاتك وميزانيتك مرة واحدة لتعمل في كل مطعم."
          : "Set your hard allergies/intolerances, diet, favorite flavors, and meal budget once."
      }
    />
  );
}
