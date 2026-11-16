import { redirect } from "next/navigation";
import {
  MenuBuilderClient,
  type SerializedCategory,
} from "@/app/(restaurant)/dashboard/menu/MenuBuilderClient";
import { getGeminiConfig } from "@/lib/agents/gemini";
import { requirePageRole } from "@/lib/auth/rbac";
import { pickLocalized } from "@/lib/i18n/dictionaries";
import { getI18nContext } from "@/lib/i18n/server";
import { loadManagedRestaurants } from "@/lib/restaurant/loader";
import { canUploadPhotos } from "@/lib/storage";

export default async function RestaurantMenuBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string }>;
}) {
  const [user, { locale }, sp] = await Promise.all([
    requirePageRole(["RESTAURANT_OWNER", "ADMIN"]),
    getI18nContext(),
    searchParams,
  ]);

  const { activeRestaurant } = await loadManagedRestaurants(user, sp.restaurantId);
  if (!activeRestaurant) {
    redirect("/dashboard");
  }

  const serializedCategories: SerializedCategory[] = activeRestaurant.categories.map((cat) => ({
    id: cat.id,
    nameEn: cat.nameEn,
    nameAr: cat.nameAr,
    sortOrder: cat.sortOrder,
    items: cat.items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn,
      descriptionAr: item.descriptionAr,
      priceAed: item.priceAed.toFixed(2),
      portionSize: item.portionSize,
      ingredientsEn: item.ingredientsEn,
      ingredientsAr: item.ingredientsAr,
      dietTags: item.dietTags,
      allergens: item.allergens,
      allergenDataProvided: item.allergenDataProvided,
      spiceLevel: item.spiceLevel,
      meatType: item.meatType,
      verificationStatus: item.verificationStatus,
      aiConfidence: item.aiConfidence ? item.aiConfidence.toFixed(3) : null,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
      isPublished: item.isPublished,
      imageUrl: item.imageUrl,
      modifiers: item.modifiers.map((mod) => ({
        id: mod.id,
        nameEn: mod.nameEn,
        nameAr: mod.nameAr,
        priceDeltaAed: mod.priceDeltaAed.toFixed(2),
        removesAllergens: mod.removesAllergens,
        addsDietTags: mod.addsDietTags,
        verificationStatus: mod.verificationStatus,
      })),
    })),
  }));

  const geminiCfg = getGeminiConfig();
  const photoUploadStatus = canUploadPhotos();

  return (
    <MenuBuilderClient
      locale={locale}
      restaurantId={activeRestaurant.id}
      restaurantName={pickLocalized(activeRestaurant.nameEn, activeRestaurant.nameAr, locale)}
      categories={serializedCategories}
      aiConfigured={geminiCfg.configured}
      photoUploadStatus={photoUploadStatus}
    />
  );
}
