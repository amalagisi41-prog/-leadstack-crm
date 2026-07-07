import { LogoMark } from "@/components/brand/logo-mark";

export function Logo({
  size = 24,
  idSuffix = "",
}: {
  size?: number;
  idSuffix?: string;
}) {
  return <LogoMark size={size} idSuffix={idSuffix} />;
}
