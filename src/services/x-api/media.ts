// src/services/x-api/media.ts
// メディアアップロード (v1.1 endpoint)
// ※ v2 はメディアアップロード未対応のため v1.1 を使用
// MVP では stub として実装し、Phase2 で完成させる

import axios from "axios";
import FormData from "form-data";

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

export interface MediaUploadResult {
  media_id_string: string;
}

/**
 * 画像バッファを X Media Upload API にアップロードして media_id を返す
 *
 * @param accessToken - OAuth 2.0 アクセストークン
 * @param imageBuffer - 画像のバイナリデータ
 * @param mimeType    - 例: "image/jpeg", "image/png"
 *
 * NOTE: v1.1 endpoint は OAuth 1.0a 認証が必要なため、
 *       MVP では画像対応を後回しにし、この関数は stub として残す。
 *       本実装時は twitter-api-v2 ライブラリの media upload メソッドを推奨。
 */
export async function uploadMedia(
  accessToken: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // TODO: OAuth 1.0a 署名を実装するか twitter-api-v2 に差し替える
  throw new Error(
    "Media upload is not yet implemented. " +
      "Please implement OAuth 1.0a signing or use the twitter-api-v2 library."
  );
}

/**
 * URLから画像をダウンロードしてアップロードするヘルパー（将来用）
 */
export async function uploadMediaFromUrl(
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const res = await axios.get<Buffer>(imageUrl, {
    responseType: "arraybuffer",
  });
  const mimeType =
    (res.headers["content-type"] as string | undefined) ?? "image/jpeg";
  return uploadMedia(accessToken, Buffer.from(res.data), mimeType);
}
