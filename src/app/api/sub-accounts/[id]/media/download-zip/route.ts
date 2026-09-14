import "server-only";

import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { uniqueFileName, zipFileName } from "@/lib/marketing/media-zip";

export const runtime = "nodejs";

/** Maximum assets we'll pack into a single ZIP to stay within memory/time limits. */
const MAX_ASSETS = 200;

/**
 * POST /api/sub-accounts/[id]/media/download-zip
 *
 * Accepts { propertyId } in the JSON body. Queries all mediaAssets for that
 * property, fetches each file from Firebase Storage (or the Firestore chunk
 * fallback), and streams a ZIP archive back to the client.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const access = await requireSubAccountAdmin(request, id);
    if (access instanceof NextResponse) return access;

    const body = await request.json().catch(() => null);
    const propertyId = String(body?.propertyId ?? "").trim();
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required." },
        { status: 400 },
      );
    }

    // Fetch all media assets for this property
    const db = getAdminDb();
    const snap = await db
      .collection(`subAccounts/${id}/mediaAssets`)
      .where("propertyId", "==", propertyId)
      .limit(MAX_ASSETS)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { error: "No media assets found for this property." },
        { status: 404 },
      );
    }

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    // Set up the ZIP archive
    const archive = new ZipArchive({ zlib: { level: 5 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Track file names to avoid duplicates
    const usedNames = new Set<string>();

    // Add each asset to the archive
    const assetPromises = snap.docs.map(async (doc) => {
      const asset = doc.data();
      const name = uniqueFileName(
        String(asset.name ?? `asset-${doc.id}`),
        usedNames,
      );
      const storagePath = String(asset.storagePath ?? "");

      try {
        if (storagePath.startsWith("firestore:")) {
          // Firestore chunk fallback
          const chunks = await doc.ref
            .collection("chunks")
            .orderBy("index", "asc")
            .get();
          if (!chunks.empty) {
            const buf = Buffer.concat(
              chunks.docs.map((c) =>
                Buffer.from(String(c.data().data ?? ""), "base64"),
              ),
            );
            archive.append(buf, { name });
          }
        } else if (bucketName && storagePath) {
          // Firebase Storage
          const [contents] = await getStorage()
            .bucket(bucketName)
            .file(storagePath)
            .download();
          archive.append(contents, { name });
        }
      } catch (err) {
        // Skip assets that fail to download — don't break the whole ZIP
        console.warn(
          `[download-zip] Skipping asset ${doc.id} (${name}):`,
          err,
        );
      }
    });

    await Promise.all(assetPromises);
    archive.finalize();

    // Convert the PassThrough stream into a web-compatible ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        passthrough.on("data", (chunk: Buffer) =>
          controller.enqueue(new Uint8Array(chunk)),
        );
        passthrough.on("end", () => controller.close());
        passthrough.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName(propertyId)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("ZIP download error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create ZIP.",
      },
      { status: 500 },
    );
  }
}
