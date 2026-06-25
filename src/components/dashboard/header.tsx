"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  LogOut,
  User,
  CreditCard,
  Search,
  ChevronDown,
  Check,
  Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { signOutUser } from "@/lib/firebase/auth";
import { maskEmail } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onMenuClick: () => void;
  onOpenSearch?: () => void;
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/agency\/sub-accounts\/new/, "New sub-account"],
  [/^\/agency\/sub-accounts/, "Sub-accounts"],
  [/^\/agency\/settings/, "Agency settings"],
  [/^\/agency\/members/, "Agency staff"],
  [/^\/agency\/get-started/, "Get started"],
  [/^\/agency$/, "Agency"],
  [/^\/sa\/[^/]+\/dashboard\/settings/, "Settings"],
  [/^\/sa\/[^/]+\/dashboard$/, "Dashboard"],
  [/^\/sa\/[^/]+\/conversations\/[^/]+/, "Conversation"],
  [/^\/sa\/[^/]+\/conversations/, "Conversations"],
  [/^\/sa\/[^/]+\/contacts\/[^/]+/, "Contact"],
  [/^\/sa\/[^/]+\/contacts/, "Contacts"],
  [/^\/sa\/[^/]+\/pipeline/, "Pipeline"],
  [/^\/sa\/[^/]+\/calendar/, "Calendar"],
  [/^\/sa\/[^/]+\/tasks/, "Tasks"],
  [/^\/sa\/[^/]+\/forms\/[^/]+/, "Form builder"],
  [/^\/sa\/[^/]+\/forms/, "Forms"],
  [/^\/sa\/[^/]+\/website/, "Website"],
  [/^\/sa\/[^/]+\/templates\/new/, "New template"],
  [/^\/sa\/[^/]+\/templates\/[^/]+/, "Edit template"],
  [/^\/sa\/[^/]+\/templates/, "Templates"],
  [/^\/sa\/[^/]+\/workflows\/[^/]+\/runs/, "Workflow runs"],
  [/^\/sa\/[^/]+\/workflows\/[^/]+/, "Edit workflow"],
  [/^\/sa\/[^/]+\/workflows/, "Workflows"],
  [/^\/sa\/[^/]+\/ai-agents\/sms/, "AI Agents · SMS"],
  [/^\/sa\/[^/]+\/ai-agents\/voice/, "AI Agents · Voice"],
  [/^\/sa\/[^/]+\/ai-agents\/email/, "AI Agents · Email"],
  [/^\/sa\/[^/]+\/ai-agents\/web-chat/, "AI Agents · Web Chat"],
  [/^\/sa\/[^/]+\/ai-agents\/google-business/, "AI Agents · Google Business"],
  [/^\/sa\/[^/]+\/ai-agents/, "AI Agents"],
  [/^\/sa\/[^/]+\/reports/, "Reports"],
  [/^\/sa\/[^/]+\/logs/, "Logs"],
];

function titleFor(pathname: string): string {
  for (const [re, label] of TITLES) {
    if (re.test(pathname)) return label;
  }
  return "LeadStack";
}

function activeSubAccountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sa\/([^/]+)/);
  return match ? match[1] : null;
}

export function Header({ onMenuClick, onOpenSearch }: HeaderProps) {
  const { user, memberships } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = titleFor(pathname);
  const activeSubId = activeSubAccountFromPath(pathname);
  // Defer auth-dependent rendering until after hydration. Without this gate
  // the conditional sub-account switcher dropdown is absent on the server
  // (auth is client-side only) but present on the client once Firebase auth
  // resolves, which shifts useId() numbering for sibling Base UI dropdowns
  // and prints a hydration warning. Rendering both dropdowns together on a
  // post-hydration re-render avoids the mismatch.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => setAuthReady(true), []);
  const activeMembership = memberships.find(
    (m) => m.subAccountId === activeSubId,
  );
  // Avatar dropdown links:
  //   - "Your account" → /me/settings (user-level: profile, password,
  //     appearance, sign out — global, same across every sub-account).
  //   - "Billing" → whichever sub-account's settings is active (subscription
  //     lives at sub-account scope per the three-tier model). Falls back
  //     to agency settings when no sub-account is selected.
  const billingHref = activeSubId
    ? `/sa/${activeSubId}/dashboard/settings`
    : "/agency/settings";
  // Email defaults to masked in the dropdown header so screenshares don't
  // leak the operator's address. Per-session toggle.
  const [emailShown, setEmailShown] = useState(false);
  const isMac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

  async function handleSignOut() {
    await signOutUser();
    router.push("/");
  }

  function handleSwitchSubAccount(targetSubId: string) {
    if (!activeSubId) {
      router.push(`/sa/${targetSubId}/dashboard`);
      return;
    }
    // Preserve the current section (contacts/pipeline/...) when switching.
    const tail = pathname.replace(/^\/sa\/[^/]+/, "");
    router.push(`/sa/${targetSubId}${tail || "/dashboard"}`);
  }

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="text-lg font-semibold">{title}</h1>

      {authReady && memberships.length > 0 && (activeSubId || memberships.length > 1) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 md:inline-flex"
              />
            }
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="max-w-[160px] truncate">
              {activeMembership
                ? `${
                    activeMembership.accountNumber !== undefined
                      ? `#${activeMembership.accountNumber} `
                      : ""
                  }${activeMembership.name}`
                : "Pick sub-account"}
            </span>
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Sub-accounts
            </div>
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.subAccountId}
                onClick={() => handleSwitchSubAccount(m.subAccountId)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  {m.accountNumber !== undefined && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{m.accountNumber}
                    </span>
                  )}
                  <span className="truncate">
                    {m.name || m.subAccountId}
                  </span>
                </span>
                {m.subAccountId === activeSubId && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/agency")}
              className="text-xs"
            >
              <Building2 className="mr-2 h-3.5 w-3.5" />
              Agency home
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <button
        type="button"
        onClick={onOpenSearch}
        className={cn(
          "ml-2 hidden h-9 flex-1 max-w-md items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex",
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:ml-0">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full"
              />
            }
          >
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={user?.photoURL ?? undefined}
                alt={user?.displayName ?? "User"}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">
                {user?.displayName ?? "User"}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                  {emailShown ? user?.email : maskEmail(user?.email)}
                </p>
                {user?.email && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEmailShown((v) => !v);
                    }}
                    className="shrink-0 rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {emailShown ? "Hide" : "Show"}
                  </button>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/me/settings" />}>
              <User className="mr-2 h-4 w-4" />
              Your account
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={billingHref} />}>
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
