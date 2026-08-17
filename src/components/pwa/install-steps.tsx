"use client";

import { Share, MoreVertical, Plus } from "lucide-react";
import type { InstallPlatform } from "@/lib/pwa/install-state";

/**
 * The actual steps, per platform.
 *
 * Shared by the sign-in prompt and the download page so someone who skips the
 * prompt and comes back later is not reading a second, subtly different set of
 * instructions for the same three taps.
 *
 * Written for someone who has never installed a web app: named menu items, in
 * order, with the icon they will actually see. "Add to Home Screen" is quoted
 * exactly as iOS labels it, because that is the string they are hunting for.
 */
export function InstallSteps({
  platform,
  brandName,
}: {
  platform: InstallPlatform;
  brandName: string;
}) {
  if (platform === "ios") {
    return (
      <ol className="space-y-2.5 text-sm leading-6 text-[#3C4A60]">
        <li className="flex gap-2.5">
          <Step n={1} />
          <span>
            Tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
            <strong>Share</strong> button — at the bottom of the screen on an
            iPhone, at the top on an iPad.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Step n={2} />
          <span>
            Scroll down the list and tap{" "}
            <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Step n={3} />
          <span>
            Tap <strong>Add</strong>. {brandName} appears on your home screen
            like any other app.
          </span>
        </li>
      </ol>
    );
  }

  if (platform === "safari-desktop") {
    return (
      <ol className="space-y-2.5 text-sm leading-6 text-[#3C4A60]">
        <li className="flex gap-2.5">
          <Step n={1} />
          <span>
            In the Safari menu bar, open <strong>File</strong>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Step n={2} />
          <span>
            Choose <strong>Add to Dock</strong>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Step n={3} />
          <span>
            Confirm with <strong>Add</strong>. {brandName} opens from your Dock
            like a desktop app.
          </span>
        </li>
      </ol>
    );
  }

  // Chromium without a captured prompt — usually Android Chrome before the
  // event fires, or a desktop browser where the user must use the menu.
  return (
    <ol className="space-y-2.5 text-sm leading-6 text-[#3C4A60]">
      <li className="flex gap-2.5">
        <Step n={1} />
        <span>
          Open your browser menu —{" "}
          <MoreVertical className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
          in the corner of the window.
        </span>
      </li>
      <li className="flex gap-2.5">
        <Step n={2} />
        <span>
          Choose <strong>Install {brandName}</strong>, or{" "}
          <strong>Add to Home screen</strong> on Android.
        </span>
      </li>
      <li className="flex gap-2.5">
        <Step n={3} />
        <span>
          Confirm with{" "}
          <Plus className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
          <strong>Install</strong>.
        </span>
      </li>
    </ol>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#173B7A] text-[11px] font-bold text-white"
    >
      {n}
    </span>
  );
}
