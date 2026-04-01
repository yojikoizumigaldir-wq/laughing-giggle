// src/app/api/media/upload/route.ts
// POST /api/media/upload
// multipart/form-data: file (required), postId (optional)
// Returns: { ok: true, data: { url: string } }

import { NextRequest, NextResponse } from "next/server";
import { uploadToCloudinary } from "@/src/lib/cloudinary";
import { prisma } from "@/src/lib/prisma";
import type { ApiResponse } from "@/src/types";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "file フィールドが必要です" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "image/jpeg";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cloudinary にアップロード
    const url = await uploadToCloudinary(buffer, mimeType);

    // postId が指定されていれば mediaUrls を更新
    const postId = formData.get("postId");
    if (postId && typeof postId === "string") {
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (post) {
        const updatedUrls = [...post.mediaUrls, url];
        await prisma.post.update({
          where: { id: postId },
          data: { mediaUrls: updatedUrls },
        });
      }
    }

    return NextResponse.json<ApiResponse<{ url: string }>>({
      ok: true,
      data: { url },
    });
  } catch (err) {
    console.error("[POST /api/media/upload]", err);
    const message = err instanceof Error ? err.message : "アップロード失敗";
    return NextResponse.json<ApiResponse>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
