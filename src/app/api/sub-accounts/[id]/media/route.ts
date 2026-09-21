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
    const propertyId = new URL(request.url).searchParams.get("propertyId")?.trim() ?? "";
    const snap = await getAdminDb().collection(`subAccounts/${id}/mediaAssets`).orderBy("createdAt", "desc").limit(500).get();
    const assets = snap.docs
      .map((doc) => {
        const data = doc.data();
        // Never send the storage download token as a standalone field. The
        // direct URL may contain a necessary access token, but exposing it
        // separately makes accidental logging/telemetry leakage much easier.
        const { token: _token, ...safe } = data;
        return { id: doc.id, ...safe, createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null };
      })
      .filter((asset) => !propertyId || (asset as Record<string, unknown>).propertyId === propertyId);
    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Media GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load media assets" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;

    const body = (await request.json().catch(() => null)) as {
      assetId?: string;
      name?: string;
      folderPath?: string | null;
      propertyId?: string | null;
    } | null;
    const assetId = body?.assetId?.trim();
    if (!assetId) {
      return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
    }

    const ref = getAdminDb().doc(`subAccounts/${id}/mediaAssets/${assetId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: access.uid,
    };
    if (body?.name !== undefined) {
      const name = String(body.name).trim().replace(/[^a-zA-Z0-9._ -]+/g, "").slice(0, 120);
      if (!name) return NextResponse.json({ error: "File name cannot be empty." }, { status: 400 });
      patch.name = name;
    }
    if (body?.folderPath !== undefined) {
      const folderPath = String(body.folderPath ?? "")
        .trim()
        .replace(/\\+/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, " / ");
      patch.folderPath = folderPath || null;
    }
    if (body?.propertyId !== undefined) {
      patch.propertyId = String(body.propertyId ?? "").trim() || null;
    }

    await ref.update(patch);
    const updated = (await ref.get()).data();
    if (!updated) return NextResponse.json({ error: "Could not load updated asset." }, { status: 500 });
    const { token: _token, ...safe } = updated;
    return NextResponse.json({
      asset: {
        id: assetId,
        ...safe,
        createdAt: updated.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: updated.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      },
    });
  } catch (error) {
    console.error("Media PATCH error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update media asset." }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;

    const assetId = new URL(request.url).searchParams.get("assetId")?.trim();
    if (!assetId) {
      return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
    }

    const ref = getAdminDb().doc(`subAccounts/${id}/mediaAssets/${assetId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";

    if (storagePath.startsWith("firestore:")) {
      const chunks = await ref.collection("chunks").get();
      const batch = getAdminDb().batch();
      chunks.docs.forEach((chunk) => batch.delete(chunk.ref));
      await batch.commit();
    } else if (storagePath) {
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (bucketName) {
        try {
          await getStorage().bucket(bucketName).file(storagePath).delete();
        } catch {
          // The metadata delete below is authoritative for the workspace. A
          // missing blob should not prevent the operator from cleaning up the
          // library.
        }
      }
    }

    await ref.delete();
    return NextResponse.json({ ok: true, deletedByUid: access.uid });
  } catch (error) {
    console.error("Media DELETE error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete media asset." }, { status: 500 });
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

    const brandAsset = form?.get("brandAsset") === "true";
    const folderPath =
      String(form?.get("folderPath") ?? "")
        .trim()
        .replace(/\\+/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, " / ") || null;
    const publicUrl = brandAsset
      ? `${new URL(request.url).origin}/api/sub-accounts/${id}/media/${ref.id}`
      : null;
    const asset = {
      name: cleanName,
      url,
      publicUrl,
      brandAsset,
      token,
      storagePath,
      folderPath,
      propertyId: String(form?.get("propertyId") ?? "").trim() || null,
      contentType: file.type,
      size: file.size,
      uploadedByUid: access.uid,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(asset);
    return NextResponse.json({ asset: { id: ref.id, ...asset, createdAt: new Date().toISOString() } }, { status: 201 });
  } catch (error) {
    console.error("Media POST error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
