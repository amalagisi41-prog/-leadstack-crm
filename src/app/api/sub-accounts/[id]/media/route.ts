import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const CHUNK_BYTES = 700 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "application/pdf"]);

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;
    const snap = await getAdminDb().collection(`subAccounts/${id}/mediaAssets`).orderBy("createdAt", "desc").limit(100).get();
    return NextResponse.json({ assets: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null })) });
  } catch (error) {
    console.error("Media GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load media assets" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Upload a JPG, PNG, WebP, GIF, SVG, or PDF." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep uploads under 10 MB." }, { status: 400 });

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    const path = `media/${id}/${Date.now()}-${randomUUID()}-${cleanName}`;
    const token = randomUUID();
    const ref = getAdminDb().collection(`subAccounts/${id}/mediaAssets`).doc();
    const buffer = Buffer.from(await file.arrayBuffer());
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    let url = "";
    let storagePath = path;

    try {
      if (!bucketName) throw new Error("Firebase Storage bucket is not configured");
      await getStorage().bucket(bucketName).file(path).save(buffer, {
        resumable: false,
        metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: token } },
      });
      url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    } catch (storageError) {
      console.warn("[media] Firebase Storage unavailable; using Firestore fallback", storageError);
      storagePath = `firestore:${ref.id}`;
      const batch = getAdminDb().batch();
      for (let offset = 0, index = 0; offset < buffer.length; offset += CHUNK_BYTES, index += 1) {
        const chunkRef = ref.collection("chunks").doc(String(index).padStart(4, "0"));
        batch.set(chunkRef, { index, data: buffer.subarray(offset, offset + CHUNK_BYTES).toString("base64") });
      }
      await batch.commit();
      const origin = new URL(request.url).origin;
      url = `${origin}/api/sub-accounts/${id}/media/${ref.id}?token=${token}`;
    }

    const asset = { name: cleanName, url, token, storagePath, contentType: file.type, size: file.size, uploadedByUid: access.uid, createdAt: FieldValue.serverTimestamp() };
    await ref.set(asset);
    return NextResponse.json({ asset: { id: ref.id, ...asset, createdAt: new Date().toISOString() } }, { status: 201 });
  } catch (error) {
    console.error("Media POST error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
