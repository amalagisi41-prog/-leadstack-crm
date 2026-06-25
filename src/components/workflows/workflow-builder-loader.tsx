"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  WorkflowBuilder,
  type BuilderInitial,
  type BuilderReadiness,
} from "./workflow-builder";
import type { WhatsappTemplateOption } from "./node-config-dialog";
import type { WhatsappTemplateVariable } from "@/types/whatsapp-templates";

/**
 * Client loader for the builder. Fetches the workflow via the member-gated API
 * route, and the sub-account's forms (for the form-trigger picker) via the
 * client SDK. Keeps the page component a thin server shell.
 *
 * `readiness` (which send-integrations can actually run) is computed on the
 * SERVER and passed in — env vars, the sub-account's twilioConfig, and the
 * approved-template inventory are all readable there, so doomed steps are
 * flagged deterministically rather than guessed from a defaults-open probe.
 */
export function WorkflowBuilderLoader({
  saId,
  workflowId,
  readiness,
}: {
  saId: string;
  workflowId: string;
  readiness: BuilderReadiness;
}) {
  const [initial, setInitial] = useState<BuilderInitial | null>(null);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<
    WhatsappTemplateOption[]
  >([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/sub-accounts/${saId}/workflows/${workflowId}`
        );
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { workflow: BuilderInitial };
        if (alive) setInitial(d.workflow);
      } catch {
        if (alive) setError(true);
      }
      try {
        const snap = await getDocs(
          query(
            collection(getFirebaseDb(), "forms"),
            where("subAccountId", "==", saId)
          )
        );
        if (alive) {
          setForms(
            snap.docs.map((doc) => ({
              id: doc.id,
              name: (doc.data().name as string) || "Untitled form",
            }))
          );
        }
      } catch {
        /* forms are optional — picker just shows "Any form" */
      }
      try {
        const snap = await getDocs(
          query(
            collection(
              getFirebaseDb(),
              "subAccounts",
              saId,
              "whatsappTemplates"
            ),
            where("status", "==", "approved")
          )
        );
        if (alive) {
          setWhatsappTemplates(
            snap.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                displayName: (data.displayName as string) || "Template",
                body: (data.body as string) || "",
                variables: (data.variables as WhatsappTemplateVariable[]) ?? [],
              };
            })
          );
        }
      } catch {
        /* templates optional — picker just shows "no approved templates" */
      }
    })();
    return () => {
      alive = false;
    };
  }, [saId, workflowId]);

  if (error) {
    return <p className="text-muted-foreground text-sm">Workflow not found.</p>;
  }
  if (!initial) {
    return (
      <div className="text-muted-foreground flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return (
    <WorkflowBuilder
      saId={saId}
      initial={initial}
      forms={forms}
      readiness={readiness}
      whatsappTemplates={whatsappTemplates}
    />
  );
}
