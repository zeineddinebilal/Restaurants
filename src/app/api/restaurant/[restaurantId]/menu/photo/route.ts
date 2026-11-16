import { NextRequest, NextResponse } from "next/server";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";
import { StorageNotConfiguredError, uploadDishPhoto } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const formData = await req.formData();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please attach an image file." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadDishPhoto({
      buffer,
      contentType: file.type,
      restaurantId,
    });
    return NextResponse.json(uploaded, { status: 201 });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo upload failed" },
      { status: 400 },
    );
  }
}
