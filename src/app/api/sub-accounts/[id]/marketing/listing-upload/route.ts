import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { parseListingUpload } from "@/lib/marketing/listing-upload";
import type { IdxListingDoc } from "@/types/idx";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const CHUNK_BYTES = 700 * 1024;
const SOURCE_TYPES = new Set([
  "application/pdf", "text/csv", "application/json", "text/plain", "text/html",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function saveAsset(subAccountId: string, propertyId: string, file: File, role: "source" | "property-photo"): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(`subAccounts/${subAccountId}/mediaAssets`).doc();
  const buffer = Buffer.from(await file.arrayBuffer());
  const token = randomUUID();
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const safePropertyId = propertyId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "unknown-property";
  const path = `media/${subAccountId}/properties/${safePropertyId}/${Date.now()}-${randomUUID()}-${cleanName}`;
  let storagePath = path;
  let url = "";
  try {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) throw new Error("Firebase Storage bucket is not configured");
    await getStorage().bucket(bucketName).file(path).save(buffer, { resumable: false, metadata: { contentType: file.type, metadata: { firebaseStorageDownloadTokens: token } } });
    url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch {
    storagePath = `firestore:${ref.id}`;
    const batch = db.batch();
    for (let offset = 0, index = 0; offset < buffer.length; offset += CHUNK_BYTES, index += 1) {
      batch.set(ref.collection("chunks").doc(String(index).padStart(4, "0")), { index, data: buffer.subarray(offset, offset + CHUNK_BYTES).toString("base64") });
    }
    await batch.commit();
    url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/sub-accounts/${subAccountId}/media/${ref.id}?token=${token}`;
  }
  await ref.set({ name: cleanName, url, publicUrl: null, brandAsset: false, propertyId, role, token, storagePath, contentType: file.type, size: file.size, uploadedByUid: "listing-upload", createdAt: FieldValue.serverTimestamp() });
  return url;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;
    const form = await request.formData();
    const source = form.get("listingFile");
    if (!(source instanceof File)) return NextResponse.json({ error: "Choose a listing PDF, CSV, XLSX, JSON, TXT, or HTML file." }, { status: 400 });
    if (!SOURCE_TYPES.has(source.type) && !/\.(pdf|csv|xlsx?|json|txt|html?)$/i.test(source.name)) return NextResponse.json({ error: "Unsupported listing file format." }, { status: 400 });
    if (source.size > MAX_SOURCE_BYTES) return NextResponse.json({ error: "Keep listing files under 15 MB." }, { status: 400 });
    const photoFiles = form.getAll("photos").filter((value): value is File => value instanceof File);
    if (photoFiles.length > 20) return NextResponse.json({ error: "Upload up to 20 listing photos at a time." }, { status: 400 });
    if (photoFiles.some((file) => !PHOTO_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES)) return NextResponse.json({ error: "Photos must be JPG, PNG, WebP, or GIF files under 10 MB each." }, { status: 400 });

    const sourceId = `import-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const listing = await parseListingUpload({ buffer: Buffer.from(await source.arrayBuffer()), filename: source.name, subAccountId: id, sourceId, photos: [] });
    if (typeof listing === "string") return NextResponse.json({ error: listing }, { status: 400 });
    const [sourceUrl, photoUrls] = await Promise.all([
      saveAsset(id, listing.id, source, "source"),
      Promise.all(photoFiles.map((file) => saveAsset(id, listing.id, file, "property-photo"))),
    ]);
    listing.photos = photoUrls;
    const db = getAdminDb();
    const listingRef = db.doc(`subAccounts/${id}/idxListings/${listing.id}`);
    await listingRef.set({ ...listing, raw: { ...listing.raw, importedFrom: source.name, mediaFolder: `media/${id}/properties/${listing.id}` }, syncedAt: FieldValue.serverTimestamp() } satisfies Omit<IdxListingDoc, "syncedAt"> & { syncedAt: FieldValue }, { merge: true });
    await db.collection(`subAccounts/${id}/listingImports`).doc(sourceId).set({ sourceName: source.name, sourceType: source.type, sourceUrl, listingId: listing.id, mediaFolder: `media/${id}/properties/${listing.id}`, photoCount: photoUrls.length, importedByUid: access.uid, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, listing: { ...listing, id: listing.id, photos: photoUrls }, sourceName: source.name, photoCount: photoUrls.length }, { status: 201 });
  } catch (error) {
    console.error("Listing upload error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Listing import failed." }, { status: 500 });
  }
}
