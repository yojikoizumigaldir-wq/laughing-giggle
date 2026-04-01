// src/services/x-api/media.ts
// X Media Upload API (v1.1) への画像アップロード
// OAuth 1.0a 認証を使用（v2 はメディアアップロード未対応のため v1.1 を使用）

import { getOAuth1aCredentials, generateOAuth1aHeader } from "./oauth1a";

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

export interface MediaUploadResult {
  media_id_string: string;
}

/**
 * 画像バッファを X Media Upload API にアップロードして media_id_string を返す
 * - OAuth 1.0a 認証を使用
 * - multipart/form-data で送信（form params は OAuth 署名に含めない）
 *
 * @param imageBuffer - 画像のバイナリデータ
 * @param mimeType    - 例: "image/jpeg", "image/png"
 */
export async function uploadMediaToX(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const credentials = getOAuth1aCredentials();

  // multipart/form-data の場合、body params は OAuth 署名に含めない
  const authHeader = generateOAuth1aHeader(
    "POST",
    UPLOAD_URL,
    credentials
    // bodyParams は意図的に省略（multipart は署名対象外）
  );

  // FormData を組み立て
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  formData.append("media", blob, "media");

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `X media upload 失敗 (${res.status}): ${errText}`
    );
  }

  const json = (await res.json()) as { media_id_string: string };
  return json.media_id_string;
}

/**
 * URL から画像をダウンロードして X にアップロードするヘルパー
 */
export async function uploadMediaFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`画像のダウンロード失敗 (${res.status}): ${imageUrl}`);
  }
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadMediaToX(buffer, mimeType);
}
