import { DinerProfileBuilder } from "@/components/DinerProfileBuilder";
import { getGeminiConfig } from "@/lib/agents/gemini";
import { getActiveDinerProfile } from "@/lib/diner/profile";
import { getI18nContext } from "@/lib/i18n/server";

export default async function DinerProfilePage({
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
      initialProfile={profile}
      aiConfigured={aiConfigured}
      returnTo={sp.returnTo}
      heading={isAr ? "ملفك الغذائي وتفضيلاتك" : "Your Food Profile & Preferences"}
      subheading={
        isAr
          ? "عدّل القيود الصارمة، النكهات المفضلة، وميزانية الوجبة بالدرهم في أي وقت."
          : "Update your allergies, diet, favorite flavors, and AED meal budget anytime."
      }
    />
  );
}
