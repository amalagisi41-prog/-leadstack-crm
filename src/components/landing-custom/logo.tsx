import { LogoMark } from "@/components/brand/logo-mark";

export function Logo({
  size = 24,
  idSuffix = "",
  tone = "light",
}: {
  size?: number;
  idSuffix?: string;
  tone?: "light" | "dark";
}) {
  return <LogoMark size={size} idSuffix={idSuffix} tone={tone} />;
}
