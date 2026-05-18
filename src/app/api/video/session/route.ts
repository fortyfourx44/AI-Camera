import { NextRequest, NextResponse } from "next/server";

import { createVideoSessionFromUploads, getActiveVideoSession } from "@/lib/video-session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = getActiveVideoSession();
    if (!session) return NextResponse.json({ session: null });
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const name = (form.get("name") as string) || "Video clip";
    const durationRaw = form.get("durationSeconds");
    const durationSeconds =
      typeof durationRaw === "string" ? parseFloat(durationRaw) : 0;

    const frames: { buffer: Buffer; ext?: string }[] = [];
    const entries = [...form.entries()].filter(([k]) => k.startsWith("frame"));
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [, value] of entries) {
      if (!(value instanceof File)) continue;
      const buf = Buffer.from(await value.arrayBuffer());
      const ext = value.type === "image/png" ? ".png" : ".jpg";
      frames.push({ buffer: buf, ext });
    }

    if (frames.length === 0) {
      return NextResponse.json({ error: "No frames uploaded" }, { status: 400 });
    }

    const session = await createVideoSessionFromUploads({
      name,
      frames,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    });

    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { setActiveVideoSessionId } = await import("@/lib/video-session");
    setActiveVideoSessionId(null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
