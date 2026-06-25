import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  contactFormFields,
  contactFormSettings,
  defaultFormFields,
  defaultFormSettings,
  type FormTemplate,
  type LeadForm,
} from "@/types/forms";
import type { TenantScope } from "@/types";

const FORMS = "forms";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "form"
  );
}

export function subscribeToForms(
  scope: TenantScope,
  callback: (forms: LeadForm[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), FORMS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const forms = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<LeadForm, "id">) }),
      );
      forms.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(forms);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToForm(
  id: string,
  callback: (form: LeadForm | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), FORMS, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<LeadForm, "id">) });
    },
    (err) => onError?.(err),
  );
}

export async function createForm(
  scope: TenantScope,
  createdByUid: string,
  name: string,
  template: FormTemplate = "blank",
): Promise<string> {
  const fields =
    template === "contact" ? contactFormFields() : defaultFormFields();
  const settings =
    template === "contact" ? contactFormSettings() : defaultFormSettings();
  const ref = await addDoc(collection(getFirebaseDb(), FORMS), {
    name,
    slug: slugify(name),
    fields,
    settings,
    agencyId: scope.agencyId,
    subAccountId: scope.subAccountId,
    createdByUid,
    enabled: true,
    submissionCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateForm(
  id: string,
  data: Partial<
    Omit<
      LeadForm,
      | "id"
      | "agencyId"
      | "subAccountId"
      | "createdByUid"
      | "createdAt"
      | "submissionCount"
    >
  >,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), FORMS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteForm(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), FORMS, id));
}

export async function getForm(id: string): Promise<LeadForm | null> {
  const snap = await getDoc(doc(getFirebaseDb(), FORMS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<LeadForm, "id">) };
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
