"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/contacts/contact-form";
import { useSubAccount } from "@/context/sub-account-context";
import type { ContactFormData } from "@/types/contacts";

export function AddContactModal() {
  const { subAccountId } = useSubAccount();
  const [open, setOpen] = useState(false);

  // Goes through the server route (not a direct Firestore write) so the
  // create runs server-side and fires the contact.created webhook.
  async function handleCreate(data: ContactFormData) {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subAccountId, ...data }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(payload.error ?? "Couldn't add contact. Try again.");
      return;
    }
    toast.success("Contact added");
    setOpen(false);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Add Contact
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add Contact</SheetTitle>
            <SheetDescription>
              Capture a new lead. They&apos;ll appear in your list instantly.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            <ContactForm
              onSubmit={handleCreate}
              onCancel={() => setOpen(false)}
              submitLabel="Add Contact"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
