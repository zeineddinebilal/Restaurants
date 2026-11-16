import { ForRestaurantsClient } from "@/app/(diner)/for-restaurants/ForRestaurantsClient";
import { getI18nContext } from "@/lib/i18n/server";

export default async function ForRestaurantsPage() {
  const { locale } = await getI18nContext();
  return <ForRestaurantsClient locale={locale} />;
}
