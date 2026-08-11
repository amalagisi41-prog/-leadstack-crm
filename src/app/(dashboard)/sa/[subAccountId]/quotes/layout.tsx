import { BrokerFeatureOnly } from "@/components/dashboard/broker-feature-only";

export default function QuotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BrokerFeatureOnly>{children}</BrokerFeatureOnly>;
}
