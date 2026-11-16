import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDishTaggingAgent } from "@/lib/agents/dish-tagging";
import { httpStatusForAgentError } from "@/lib/agents/gemini";
import { peekDailyAiQuota } from "@/lib/agents/guardrails";
import { ALLOWED_INGESTION_MIMES, runMenuIngestionAgent } from "@/lib/agents/menu-ingestion";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireRestaurantOwnerApi } from "@/lib/restaurant/access";

const jsonPayloadSchema = z.object({
  pastedText: z.string().trim().min(1).max(40_000),
});

const MAX_FILES = 4;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB max total upload size

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await context.params;
  const access = await requireRestaurantOwnerApi(restaurantId);
  if (!access.ok) return access.response;

  const clientIp = getClientIp(req.headers);
  const ipLimit = checkRateLimit({
    key: `ai:ingest:ip:${clientIp}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  const userLimit = checkRateLimit({
    key: `ai:ingest:user:${access.user.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed || !userLimit.allowed) {
    return NextResponse.json(
      { error: "AI ingestion rate limit reached. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const callerKey = `user:${access.user.id}`;
  const quota = await peekDailyAiQuota({
    callerKey,
    clientIp,
    restaurantId,
  });
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  let pastedText = "";
  const files: Array<{ mimeType: string; base64Data: string }> = [];

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const rawText = formData.get("pastedText");
    if (typeof rawText === "string") {
      pastedText = rawText.trim().slice(0, 40_000);
    }

    const uploadedEntries = formData.getAll("files");
    if (uploadedEntries.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} menu files allowed per upload.` },
        { status: 400 },
      );
    }

    let totalBytes = 0;
    for (const entry of uploadedEntries) {
      if (entry instanceof File && entry.size > 0) {
        if (!ALLOWED_INGESTION_MIMES.has(entry.type)) {
          return NextResponse.json(
            {
              error: `Unsupported file type "${entry.type}". Upload JPEG, PNG, WebP, or PDF.`,
            },
            { status: 400 },
          );
        }
        totalBytes += entry.size;
        if (totalBytes > MAX_TOTAL_BYTES) {
          return NextResponse.json(
            { error: "Total uploaded file size exceeds 5 MB." },
            { status: 400 },
          );
        }
        // Processed strictly in memory and never persisted to disk
        const buf = Buffer.from(await entry.arrayBuffer());
        files.push({
          mimeType: entry.type,
          base64Data: buf.toString("base64"),
        });
      }
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const parsed = jsonPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide pasted menu text or upload menu photo(s)/PDF." },
        { status: 400 },
      );
    }
    pastedText = parsed.data.pastedText;
  }

  const ingestionResult = await runMenuIngestionAgent({
    pastedText: pastedText || undefined,
    files,
    restaurantId,
    userId: access.user.id,
    callerKey,
    clientIp,
  });

  if (!ingestionResult.ok) {
    const status = httpStatusForAgentError(ingestionResult.reason);
    return NextResponse.json(
      {
        error: ingestionResult.message,
        reason: ingestionResult.reason,
      },
      { status },
    );
  }

  // Flatten extracted dishes to chain Dish Tagging Agent (#2)
  const flatItems = ingestionResult.data.categories.flatMap((cat) =>
    cat.items.map((item) => ({
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn,
      ingredientsEn: item.ingredientsEn,
      existingModifiers: item.modifiers,
    })),
  );

  const taggingResult = await runDishTaggingAgent({
    dishes: flatItems,
    restaurantId,
    userId: access.user.id,
    callerKey,
    clientIp,
  });

  const tagByIndex = new Map(
    taggingResult.ok ? taggingResult.data.items.map((t) => [t.index, t]) : [],
  );

  let runningIndex = 0;
  const categories = ingestionResult.data.categories.map((cat) => ({
    nameEn: cat.nameEn,
    nameAr: cat.nameAr,
    items: cat.items.map((item) => {
      const idx = runningIndex++;
      const tag = tagByIndex.get(idx);
      const mergedModifiers = tag?.suggestedModifiers.length
        ? tag.suggestedModifiers
        : item.modifiers.map((m) => ({
            ...m,
            removesAllergens: [] as string[],
            addsDietTags: [] as string[],
          }));

      return {
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        descriptionEn: item.descriptionEn,
        descriptionAr: item.descriptionAr,
        priceAed: item.priceAed,
        portionSize: item.portionSize,
        ingredientsEn: item.ingredientsEn,
        ingredientsAr: item.ingredientsAr,
        dietTags: tag?.dietTags ?? [],
        allergens: tag?.allergens ?? [],
        allergenDataProvided: false,
        spiceLevel: tag?.spiceLevel ?? "NONE",
        meatType: tag?.meatType ?? "NONE",
        aiConfidence: tag?.aiConfidence ?? null,
        verificationStatus: "AI_SUGGESTED" as const,
        modifiers: mergedModifiers,
      };
    }),
  }));

  return NextResponse.json({ categories });
}
