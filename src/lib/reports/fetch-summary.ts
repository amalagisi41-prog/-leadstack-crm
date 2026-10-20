import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { buildReportsSummary, type ReportsRangeKey, type ReportsSummary } from "./summary";
import type { Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * The Firestore side of buildReportsSummary() — split out so both
 * /reports/summary and the performance-narrative skill read the same way
 * without one calling the other over HTTP. Excludes seeded sample data
 * (isSample === true) on both collections; see buildReportsSummary's own
 * doc comment for why that matters.
 */
export async function fetchReportsSummary(
  subAccountId: string,
  range: ReportsRangeKey
): Promise<ReportsSummary> {
  const db = getAdminDb();
  const [subSnap, dealsSnap, contactsSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.collection("deals").where("subAccountId", "==", subAccountId).get(),
    db.collection("contacts").where("subAccountId", "==", subAccountId).get(),
  ]);

  const pipelineStages = (subSnap.data() as SubAccountDoc | undefined)
    ?.pipelineStages;

  const deals = dealsSnap.docs
    .map((d) => d.data() as Deal)
    .filter((d) => d.isSample !== true);
  const contacts = contactsSnap.docs
    .map((d) => d.data() as Contact)
    .filter((c) => c.isSample !== true);

  return buildReportsSummary({ deals, contacts, pipelineStages, range });
}
