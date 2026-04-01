// src/lib/cloudinary.ts
// Cloudinary へ画像をアップロードするヘルパー（SDK 不使用・REST API 直接呼び出し）
// 必要な環境変数: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import crypto from "crypto";

const FOLDER = "x-post-bridge";

/**
 * 画像バッファを Cloudinary にアップロードして secure_url を返す
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary の環境変数が設定されていません。" +
        " CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET を .env.local に設定してください。"
    );
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();

  // SHA-1 署名: sha1("folder={folder}&timestamp={ts}" + API_SECRET)
  const signaturePayload = `folder=${FOLDER}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto
    .createHash("sha1")
    .update(signaturePayload)
    .digest("hex");

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  // multipart/form-data を手動で組み立てる（fetch の FormData を使用）
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file", blob, "upload");
  formData.append("folder", FOLDER);
  formData.append("timestamp", timestamp);
  formData.append("api_key", apiKey);
  formData.append("signature", signature);

  const res = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Cloudinary アップロード失敗 (${res.status}): ${errText}`
    );
  }

  const json = (await res.json()) as { secure_url: string };
  return json.secure_url;
}
