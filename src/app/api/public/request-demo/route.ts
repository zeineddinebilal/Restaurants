import { NextRequest, NextResponse } from "next/server";
import { submitWebsiteDemoRequest } from "@/lib/admin/prospects";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rl = checkRateLimit({
    key: `public:demo-request:${clientIp}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many demo requests submitted recently. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const res = await submitWebsiteDemoRequest(body);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
