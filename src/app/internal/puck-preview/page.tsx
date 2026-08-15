import { notFound } from "next/navigation";
import { PuckPreviewClient } from "./puck-preview-client";

export default function PuckPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PuckPreviewClient />;
}
