import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { UserDoc } from "@/types";

export async function createUserDoc(
  uid: string,
  data: Partial<UserDoc>,
): Promise<void> {
  const ref = doc(getFirebaseDb(), "users", uid);
  await setDoc(ref, {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const ref = doc(getFirebaseDb(), "users", uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as UserDoc;
}

export async function updateUserDoc(
  uid: string,
  data: Partial<UserDoc>,
): Promise<void> {
  const ref = doc(getFirebaseDb(), "users", uid);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date(),
  });
}
