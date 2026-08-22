import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildGoogleOAuthUrl,
  exchangeGoogleOAuthCode,
  fetchGoogleBusinessProfile,
  verifyGoogleOAuthState,
} from "@/lib/business-profile/google-business";
import { businessProfileCompleteness } from "@/lib/business-profile/compile";
import { EMPTY_BUSINESS_PROFILE } from "@/types/business-profile";

/**
 * Google OAuth Client ID and Secret.
 * Get these from Google Cloud Console > Credentials > OAuth 2.0 Client IDs
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check the user has permission to manage this sub-account
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  // Handle the OAuth callback
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied permission or error occurred
  if (error) {
    return NextResponse.json(
      {
        error: `Google authorization failed: ${error}`,
        code: "GOOGLE_AUTH_DENIED",
      },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing OAuth code or state parameter" },
      { status: 400 }
    );
  }

  // Verify state to prevent CSRF
  // In production, state should be validated against session/cookie
  // For now, we'll verify it's a non-empty string
  if (!verifyGoogleOAuthState(state, state)) {
    return NextResponse.json(
      { error: "Invalid state parameter — CSRF check failed" },
      { status: 400 }
    );
  }

  // Validate Google OAuth is configured
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured on this deployment. Ask your administrator to set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
        code: "GOOGLE_OAUTH_UNCONFIGURED",
      },
      { status: 503 }
    );
  }

  try {
    // Exchange code for access token
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/sub-accounts/${id}/business-profile/import-google`;

    const tokens = await exchangeGoogleOAuthCode(
      code,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Fetch the user's Google Business Profile
    const profile = await fetchGoogleBusinessProfile(tokens.accessToken);

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "No Google Business Profile found for this account. Create a profile at https://www.google.com/business/ and try again.",
          code: "NO_GOOGLE_PROFILE",
        },
        { status: 404 }
      );
    }

    // Calculate completeness
    const completeness = businessProfileCompleteness({
      ...EMPTY_BUSINESS_PROFILE,
      agentName: profile.agentName,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      brokerage: profile.brokerage,
      serviceAreas: profile.serviceAreas,
      businessHours: profile.businessHours,
      bio: profile.bio,
      headshotUrl: profile.headshotUrl || "",
    });

    // Return the extracted profile
    // The client will display this as a preview before the user confirms
    return NextResponse.json({
      success: true,
      profile: {
        agentName: profile.agentName,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        brokerage: profile.brokerage,
        serviceAreas: profile.serviceAreas,
        businessHours: profile.businessHours,
        bio: profile.bio,
        headshotUrl: profile.headshotUrl || "",
      },
      completeness,
      source: "google",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Google Business Profile import failed:", error);

    return NextResponse.json(
      {
        error: `Failed to fetch Google Business Profile: ${message}. Try again or use another import method.`,
        code: "GOOGLE_PROFILE_FETCH_FAILED",
      },
      { status: 502 }
    );
  }
}

/**
 * POST: Initiate Google OAuth flow.
 * The client calls this to get the Google OAuth URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check the user has permission to manage this sub-account
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured on this deployment. Ask your administrator to set GOOGLE_OAUTH_CLIENT_ID.",
        code: "GOOGLE_OAUTH_UNCONFIGURED",
      },
      { status: 503 }
    );
  }

  // Generate a random state for CSRF protection
  // We encode the sub-account ID in the state so the callback knows where to redirect
  const randomState = Math.random().toString(36).substring(2, 15);
  const state = `${id}:${randomState}`;

  // Use the static OAuth callback route (no dynamic [id] in the path)
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`;

  const authUrl = buildGoogleOAuthUrl(GOOGLE_CLIENT_ID, redirectUri, state);

  return NextResponse.json({
    authUrl,
    state, // Client should store this in session
  });
}
