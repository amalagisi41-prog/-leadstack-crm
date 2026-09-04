import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";
import { SubAccountProvider } from "@/context/sub-account-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}): Promise<Metadata> {
  const { subAccountId } = await params;
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const workspace = (snap.data()?.name as string | undefined) ?? "Workspace";
  return {
    title: { default: workspace, template: `%s · ${workspace}` },
  };
}

export default async function SubAccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  return (
    <SubAccountProvider subAccountId={subAccountId}>
      {children}
    </SubAccountProvider>
  );
}
