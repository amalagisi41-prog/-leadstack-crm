import { Suspense } from "react";
import { BusinessProfileForm } from "@/components/business-profile/business-profile-form";

// useSearchParams() inside BusinessProfileForm requires a Suspense boundary.
export default function BusinessProfilePage() {
  return (
    <Suspense>
      <BusinessProfileForm />
    </Suspense>
  );
}
