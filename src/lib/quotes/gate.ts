import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Quotes, invoices and the product catalog are an agency-gated add-on
 * (`quotesEnabledByAgency`). Returns a 403 response while the gate is off,
 * or null when the caller may proceed. Read `=== true` so legacy docs stay off.
 */
export async function quotesGateResponse(
  subAccountId: string,
): Promise<NextResponse | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (snap.data()?.quotesEnabledByAgency === true) return null;
  return NextResponse.json(
    {
      error:
        "Quotes & invoices aren't turned on for this workspace. Ask your agency owner to enable them from Manage in the agency sub-accounts list.",
    },
    { status: 403 },
  );
}
