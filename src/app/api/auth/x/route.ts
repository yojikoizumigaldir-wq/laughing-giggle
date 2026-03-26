// src/app/api/auth/x/route.ts
// OAuth 2.0 User Context フロー開始（PKCE対応）

import { NextRequest, NextResponse } from "next/server";
import { generatePKCE, generateAuthorizationUrl } from "@/src/services/x-api/auth";

export async function GET(req: NextRequest) {
  try {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const authUrl = generateAuthorizationUrl(codeChallenge);

    const response = NextResponse.redirect(authUrl);

    // code_verifier を httpOnly Cookie に保存（callback で使用）
    response.cookies.set("pkce_verifier", codeVerifier, {
      httpOnly: true,
      maxAge: 60 * 15, // 15分
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[OAuth Init Error]", errorMsg);
    return NextResponse.json(
      {
        success: false,
        error: "OAuth initialization failed",
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
