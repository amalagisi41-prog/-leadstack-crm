import "server-only";

/**
 * Google Business Profile extraction via the Google Business Profile API.
 *
 * Agents can authenticate with their Google account to import their Business
 * Profile data directly. This is more reliable than scraping portals because:
 * - The data is structured and verified by Google
 * - No bot-wall issues or rate limiting
 * - Phone, email, hours, service areas all provided
 * - No extraction parsing needed
 *
 * Flow:
 * 1. User clicks "Import from Google Business Profile"
 * 2. They're redirected to Google OAuth consent screen
 * 3. We get an access token + refresh token
 * 4. We call the Google Business Profile API to list their locations
 * 5. We extract profile data for their primary location
 * 6. Extract completes with 100% coverage (all Google-provided fields)
 */

export interface GoogleBusinessProfile {
  agentName: string;
  phone: string;
  email: string;
  website: string;
  brokerage: string;
  serviceAreas: string;
  businessHours: string;
  bio: string;
  headshotUrl?: string;
}

/**
 * Google Business Profile API location response (simplified).
 * The actual response is much larger; we extract only what we need.
 */
interface GoogleLocation {
  name: string; // "accounts/ABC/locations/XYZ"
  displayName: string; // agent name
  primaryPhone: string;
  primaryContactInfo?: {
    emails?: string[];
  };
  websiteUri: string;
  businessType: string;
  shortDescription: string;
  profile?: {
    description: string;
  };
  serviceAreaBusinesses?: Array<{
    businessType: string;
    areas?: Array<{
      displayName: string;
    }>;
  }>;
  regularHours?: {
    periods: Array<{
      openDay: number; // 0=Sunday, 6=Saturday
      openTime: { hours: number; minutes: number };
      closeDay: number;
      closeTime: { hours: number; minutes: number };
    }>;
  };
  photos?: Array<{
    name: string;
    mediaKey: string;
    uploadUrl: string;
  }>;
}

/**
 * Build the Google OAuth authorization URL.
 * The user's browser redirects here to consent to data access.
 */
export function buildGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    state,
    access_type: "offline", // request refresh token
    prompt: "consent", // force consent screen on each auth (so user sees what we're asking)
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange the OAuth authorization code for access + refresh tokens.
 */
export async function exchangeGoogleOAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Google OAuth token exchange failed: ${error.error_description || error.error}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * List the user's Google Business Profiles.
 * Returns their primary (first) location's profile data.
 */
export async function fetchGoogleBusinessProfile(
  accessToken: string
): Promise<GoogleBusinessProfile | null> {
  // Step 1: Get the accounts (usually just one)
  const accountsResponse = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!accountsResponse.ok) {
    throw new Error(
      `Failed to fetch Google accounts: ${accountsResponse.statusText}`
    );
  }

  const accountsData = (await accountsResponse.json()) as {
    accounts?: Array<{ name: string }>;
  };

  if (!accountsData.accounts || accountsData.accounts.length === 0) {
    return null; // No Google Business Profiles
  }

  const accountName = accountsData.accounts[0].name;

  // Step 2: Get locations under the account
  const locationsResponse = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!locationsResponse.ok) {
    throw new Error(
      `Failed to fetch Google locations: ${locationsResponse.statusText}`
    );
  }

  const locationsData = (await locationsResponse.json()) as {
    locations?: GoogleLocation[];
  };

  if (!locationsData.locations || locationsData.locations.length === 0) {
    return null; // No locations
  }

  // Use the first (primary) location
  const location = locationsData.locations[0];

  // Extract profile data
  return extractGoogleProfile(location);
}

/**
 * Extract AgentStack profile fields from a Google Business Profile location.
 */
function extractGoogleProfile(location: GoogleLocation): GoogleBusinessProfile {
  const serviceAreas: string[] = [];
  if (location.serviceAreaBusinesses) {
    for (const sab of location.serviceAreaBusinesses) {
      if (sab.areas) {
        serviceAreas.push(...sab.areas.map((a) => a.displayName));
      }
    }
  }

  const hours = formatBusinessHours(location.regularHours);

  return {
    agentName: location.displayName || "",
    phone: location.primaryPhone || "",
    email: location.primaryContactInfo?.emails?.[0] || "",
    website: location.websiteUri || "",
    brokerage: location.businessType || "", // Often "LOCAL_BUSINESS" or "REAL_ESTATE_AGENT"
    serviceAreas: serviceAreas.join(", "),
    businessHours: hours,
    bio: location.profile?.description || location.shortDescription || "",
    headshotUrl: location.photos?.[0]?.mediaKey || undefined,
  };
}

/**
 * Format Google's structured hours into human-readable string.
 * Example: "Mon–Fri 9am–6pm, Sat 10am–4pm, Sun Closed"
 */
function formatBusinessHours(
  regularHours?: {
    periods: Array<{
      openDay: number;
      openTime: { hours: number; minutes: number };
      closeDay: number;
      closeTime: { hours: number; minutes: number };
    }>;
  }
): string {
  if (!regularHours?.periods || regularHours.periods.length === 0) {
    return "";
  }

  const dayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ];

  const formatTime = (h: number, m: number): string => {
    const period = h >= 12 ? "pm" : "am";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, "0")}${period}`;
  };

  // Group periods by day range
  const grouped: string[] = [];
  for (const period of regularHours.periods) {
    const openDay = dayNames[period.openDay];
    const closeDay = dayNames[period.closeDay];
    const openTime = formatTime(
      period.openTime.hours,
      period.openTime.minutes
    );
    const closeTime = formatTime(
      period.closeTime.hours,
      period.closeTime.minutes
    );

    if (period.openDay === period.closeDay) {
      grouped.push(`${openDay} ${openTime}–${closeTime}`);
    } else {
      grouped.push(
        `${openDay}–${closeDay} ${openTime}–${closeTime}`
      );
    }
  }

  return grouped.join(", ");
}

/**
 * Verify the OAuth state parameter to prevent CSRF attacks.
 * The state token should be a random string stored in the session.
 */
export function verifyGoogleOAuthState(
  sentState: string,
  expectedState: string
): boolean {
  return sentState === expectedState && sentState.length > 0;
}
