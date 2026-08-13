import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await ctx.params;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ref = getAdminDb().doc(`subAccounts/${id}/mediaAssets/${assetId}`);
  const assetSnap = await ref.get();
  const asset = assetSnap.data();
  if (!assetSnap.exists || asset?.token !== token || !String(asset?.storagePath ?? "").startsWith("firestore:")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const chunks = await ref.collection("chunks").orderBy("index", "asc").get();
  if (chunks.empty) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = Buffer.concat(chunks.docs.map((doc) => Buffer.from(String(doc.data().data ?? ""), "base64")));
  return new NextResponse(body, {
    headers: {
      "Content-Type": String(asset.contentType ?? "application/octet-stream"),
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${String(asset.name ?? "media").replace(/["\r\n]/g, "")}"`,
    },
  });
}
