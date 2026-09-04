import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await ctx.params;
  const token = new URL(request.url).searchParams.get("token");

  const ref = getAdminDb().doc(`subAccounts/${id}/mediaAssets/${assetId}`);
  const assetSnap = await ref.get();
  const asset = assetSnap.data();
  if (!assetSnap.exists || (!asset?.brandAsset && asset?.token !== token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!String(asset?.storagePath ?? "").startsWith("firestore:")) {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [body] = await getStorage().bucket(bucketName).file(String(asset.storagePath)).download();
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": String(asset.contentType ?? "application/octet-stream"),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const chunks = await ref.collection("chunks").orderBy("index", "asc").get();
  if (chunks.empty) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = Buffer.concat(chunks.docs.map((doc) => Buffer.from(String(doc.data().data ?? ""), "base64")));
  return new NextResponse(body, {
    headers: {
      "Content-Type": String(asset.contentType ?? "application/octet-stream"),
      "Content-Length": String(body.length),
      "Cache-Control": asset.brandAsset ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      "Content-Disposition": `inline; filename="${String(asset.name ?? "media").replace(/["\r\n]/g, "")}"`,
    },
  });
}
