import { collection, addDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

export async function sendWelcomeEmail(
  email: string,
  displayName: string,
): Promise<void> {
  const mailCollection = collection(getFirebaseDb(), "mail");

  await addDoc(mailCollection, {
    to: email,
    message: {
      subject: `Welcome to our platform, ${displayName}!`,
      html: `
        <h1>Welcome, ${displayName}!</h1>
        <p>Thank you for signing up. We're excited to have you on board.</p>
        <p>Get started by visiting your <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">dashboard</a>.</p>
      `,
    },
  });
}
