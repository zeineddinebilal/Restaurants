import { NextResponse } from "next/server";
import { BRAND } from "@/config/brand";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        app: BRAND.nameEn,
        db: "connected",
        timestamp,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        app: BRAND.nameEn,
        db: "disconnected",
        timestamp,
      },
      { status: 503 },
    );
  }
}
