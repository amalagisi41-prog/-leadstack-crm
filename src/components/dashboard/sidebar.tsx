"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Home,
  Users,
  GitBranch,
  Calendar,
  CalendarClock,
  CheckSquare,
  FileText,
  FileSignature,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Workflow,
  Globe,
  Compass,
  Lock,
  Send,
  Bot,
  Package,
  ScrollText,
  MessagesSquare,
  Share2,
  GraduationCap,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import { useDueTodayCount } from "@/hooks/use-due-today";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  enabled: boolean;
  badgeKey?: "dueToday" | "unreadConversations";
  matchPrefix?: string;
}

// Per-sub-account nav. `href` is templated with the active sub-account id at
// render time; `matchPrefix` is the stem used to highlight the active link.
const SUB_ACCOUNT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home, enabled: true },
  {
    href: "/conversations",
    label: "Conversations",
    icon: MessagesSquare,
    enabled: true,
    badgeKey: "unreadConversations",
  },
  { href: "/contacts", label: "Contacts", icon: Users, enabled: true },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, enabled: true },
  { href: "/calendar", label: "Calendar", icon: Calendar, enabled: true },
  {
    href: "/booking",
    label: "Booking",
    icon: CalendarClock,
    enabled: true,
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CheckSquare,
    enabled: true,
    badgeKey: "dueToday",
  },
  { href: "/forms", label: "Forms", icon: FileText, enabled: true },
  { href: "/products", label: "Products", icon: Package, enabled: true },
  { href: "/quotes", label: "Quotes", icon: FileSignature, enabled: true },
  { href: "/website", label: "Website", icon: Globe, enabled: true },
  { href: "/workflows", label: "Workflows", icon: Workflow, enabled: true },
  { href: "/ai-agents", label: "AI Agents", icon: Bot, enabled: true },
  { href: "/broadcasts", label: "Broadcasts", icon: Send, enabled: true },
  { href: "/templates", label: "Templates", icon: FileText, enabled: true },
  { href: "/social", label: "Social Planner", icon: Share2, enabled: true },
  {
    href: "/community",
    label: "Community",
    icon: GraduationCap,
    enabled: true,
  },
  { href: "/reports", label: "Reports", icon: BarChart3, enabled: true },
  { href: "/logs", label: "Logs", icon: ScrollText, enabled: true },
  {
    href: "/dashboard/settings",
    label: "Settings Sub-Account",
    icon: Settings,
    enabled: true,
  },
];

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function activeSubAccountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sa\/([^/]+)/);
  return match ? match[1] : null;
}

function SidebarContent() {
  const pathname = usePathname();
  const dueToday = useDueTodayCount();
  const unreadConversations = useUnreadConversationsCount();
  const { agencyRole, memberships, loading } = useAuth();
  const agency = useAgency();
  const activeSubId = activeSubAccountFromPath(pathname);
  const subRoot = activeSubId ? `/sa/${activeSubId}` : null;

  // Subscribe to the active sub-account's agency-level feature gates so
  // the sidebar can render locked entries when the agency owner has
  // disabled a feature. `null` = unknown (still loading) — we optimistic-
  // render as enabled until we hear back. Tracking just `broadcasts`
  // for now; other gates (api, email) lock their own sections rather
  // than the sidebar entry.
  const [broadcastsGate, setBroadcastsGate] = useState<boolean | null>(null);
  const [websiteGate, setWebsiteGate] = useState<boolean | null>(null);
  const [socialGate, setSocialGate] = useState<boolean | null>(null);
  const [communityGate, setCommunityGate] = useState<boolean | null>(null);
  // Per-feature "hide instead of lock" overrides. Only consulted when the
  // matching gate is off — when true the entry is omitted entirely instead of
  // rendering a greyed "Locked" row, so the tenant never knows it exists.
  const [broadcastsHidden, setBroadcastsHidden] = useState(false);
  const [websiteHidden, setWebsiteHidden] = useState(false);
  const [socialHidden, setSocialHidden] = useState(false);
  const [communityHidden, setCommunityHidden] = useState(false);
  useEffect(() => {
    const linkSubIdLocal = activeSubId ?? memberships[0]?.subAccountId ?? null;
    if (!linkSubIdLocal) {
      setBroadcastsGate(null);
      setWebsiteGate(null);
      setSocialGate(null);
      setCommunityGate(null);
      return;
    }
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", linkSubIdLocal),
      (snap) => {
        const data = snap.data();
        setBroadcastsGate(data?.broadcastsEnabledByAgency === true);
        setWebsiteGate(data?.websiteEnabledByAgency === true);
        setSocialGate(data?.socialPlannerEnabledByAgency === true);
        setCommunityGate(data?.communityEnabledByAgency === true);
        setBroadcastsHidden(data?.broadcastsHiddenWhenDisabled === true);
        setWebsiteHidden(data?.websiteHiddenWhenDisabled === true);
        setSocialHidden(data?.socialPlannerHiddenWhenDisabled === true);
        setCommunityHidden(data?.communityHiddenWhenDisabled === true);
      },
      () => {
        setBroadcastsGate(null);
        setWebsiteGate(null);
        setSocialGate(null);
        setCommunityGate(null);
      },
    );
  }, [activeSubId, memberships]);

  // When no sub-account is active (agency-level pages), fall back to the
  // user's first membership for sub-account-scoped link templating.
  const fallbackSub = memberships[0]?.subAccountId ?? null;
  const linkSubId = activeSubId ?? fallbackSub;
  const showSubNav = !!linkSubId;
  const activeMembership = activeSubId
    ? memberships.find((m) => m.subAccountId === activeSubId)
    : null;
  // Header label for the SUB-ACCOUNT nav section. Reinforces which workspace
  // the user is operating inside, e.g. "SUB-ACCOUNT-1001 · SLACK INC".
  const subSectionLabel = activeMembership
    ? activeMembership.accountNumber !== undefined
      ? `Sub-account-${activeMembership.accountNumber} · ${activeMembership.name || ""}`.trim()
      : (activeMembership.name ?? "Sub-account")
    : "Sub-account";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          {agency.logoUrl ? (
            // Custom agency logo. Constrained to 24px tall, auto width;
            // the agency hosts the asset so we render whatever they paste.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.logoUrl}
              alt={agency.name}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={20} idSuffix="-sidebar" />
          )}
          <span className="truncate">{agency.name}</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {/* Agency-level nav — visible to agency owners always; everyone with
            access to /agency sees the entry. */}
        {(agencyRole === "owner" || memberships.length > 1) && (
          <div className="mb-3">
            <p className="mb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Agency
            </p>
            {agencyRole === "owner" && (
              <Link
                href="/agency/get-started"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith("/agency/get-started")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Compass className="h-4 w-4" />
                Get started
              </Link>
            )}
            <Link
              href="/agency"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/agency"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Building2 className="h-4 w-4" />
              Agency home
            </Link>
            {agencyRole === "owner" && (
              <Link
                href="/agency/sub-accounts"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith("/agency/sub-accounts")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Users className="h-4 w-4" />
                Sub-accounts
              </Link>
            )}
            {agencyRole === "owner" && (
              <Link
                href="/agency/settings"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith("/agency/settings")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Settings className="h-4 w-4" />
                Settings Agency
              </Link>
            )}
          </div>
        )}

        {showSubNav && (
          <div>
            {(agencyRole === "owner" || memberships.length > 1) && (
              <p
                className="mb-1 truncate px-3 text-[10px] uppercase tracking-wider text-muted-foreground"
                title={subSectionLabel}
              >
                {subSectionLabel}
              </p>
            )}
            {SUB_ACCOUNT_NAV.map((item) => {
              const fullHref = `${subRoot ?? `/sa/${linkSubId}`}${item.href}`;
              const isActive =
                pathname === fullHref ||
                (item.href !== "/dashboard" && pathname.startsWith(fullHref));
              // Agency-level gate lock for Broadcasts. We DO render it
              // when the gate is unknown (broadcastsGate === null) —
              // assumption: legitimate sub-accounts are enabled, and
              // flashing "Locked" → "Enabled" is worse UX than a brief
              // window where a disabled tenant can click. The send route
              // returns 403 either way.
              const gateLocked =
                (item.href === "/broadcasts" && broadcastsGate === false) ||
                (item.href === "/website" && websiteGate === false) ||
                (item.href === "/social" && socialGate === false) ||
                (item.href === "/community" && communityGate === false);
              // When the agency owner opted to hide (not just lock) a disabled
              // feature, omit the entry entirely so the tenant never sees it.
              const gateHidden =
                (item.href === "/broadcasts" &&
                  broadcastsGate === false &&
                  broadcastsHidden) ||
                (item.href === "/website" &&
                  websiteGate === false &&
                  websiteHidden) ||
                (item.href === "/social" &&
                  socialGate === false &&
                  socialHidden) ||
                (item.href === "/community" &&
                  communityGate === false &&
                  communityHidden);
              if (gateHidden) return null;
              if (!item.enabled || gateLocked) {
                const lockedByGate = gateLocked;
                return (
                  <div
                    key={item.href}
                    className="flex cursor-not-allowed items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
                    title={
                      lockedByGate
                        ? "Disabled by your agency administrator"
                        : "Coming soon"
                    }
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <span className="flex items-center gap-1 rounded-full border px-1.5 text-[10px] uppercase tracking-wide">
                      {lockedByGate && <Lock className="h-2.5 w-2.5" />}
                      {lockedByGate ? "Locked" : "Soon"}
                    </span>
                  </div>
                );
              }
              const badge =
                item.badgeKey === "dueToday" && dueToday > 0
                  ? dueToday
                  : item.badgeKey === "unreadConversations" &&
                      unreadConversations > 0
                    ? unreadConversations
                    : null;
              return (
                <Link
                  key={item.href}
                  href={fullHref}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {badge !== null && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {!showSubNav && !loading && (
          <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Pick a sub-account from{" "}
            <Link href="/agency" className="text-primary underline">
              Agency home
            </Link>{" "}
            to see its data.
          </p>
        )}
      </nav>

      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3"
          onClick={() => signOutUser()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r bg-background md:block">
        <SidebarContent />
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
