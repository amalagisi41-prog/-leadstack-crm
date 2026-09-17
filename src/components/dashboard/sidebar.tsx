"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import {
  Home,
  Sparkles,
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
  Building,
  Building2,
  Workflow,
  Compass,
  Lock,
  Send,
  Megaphone,
  Bot,
  Package,
  LayoutTemplate,
  ScrollText,
  MessagesSquare,
  Share2,
  GraduationCap,
  Filter,
  BookOpen,
  Plug,
  Link2,
  HeartPulse,
  Images,
  MapPin,
  Rocket,
  Wrench,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import { useDueTodayCount } from "@/hooks/use-due-today";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { LogoMark } from "@/components/brand/logo-mark";
import { InstallCallout } from "@/components/pwa/install-callout";
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
  badgeKey?: "dueToday" | "unreadConversations" | "siteHealth";
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/* ─── Primary nav: 7 top-level items a realtor recognises ──────── */

interface PrimaryNavItem {
  href: string;
  label: string;
  icon: typeof Home;
  badgeKey?: "dueToday" | "unreadConversations" | "siteHealth";
}

const PRIMARY_NAV: PrimaryNavItem[] = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/contacts", label: "People", icon: Users, badgeKey: "unreadConversations" },
  { href: "/pipeline", label: "Deals", icon: GitBranch },
  { href: "/properties", label: "Properties", icon: MapPin },
];

/* ─── Expandable sections under the primary items ──────────────── */

interface NavGroupItem {
  href: string;
  label: string;
  icon: typeof Home;
  enabled: boolean;
  badgeKey?: "dueToday" | "unreadConversations" | "siteHealth";
}

interface NavGroup {
  key: string;
  label: string;
  icon: typeof Home;
  items: NavGroupItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { href: "/marketing/campaigns", label: "Campaigns", icon: Megaphone, enabled: true },
      { href: "/forms", label: "Lead Capture", icon: FileText, enabled: true },
      { href: "/workflows", label: "Follow-Up Plans", icon: Workflow, enabled: true },
      { href: "/funnels", label: "Marketing Pages", icon: Filter, enabled: true },
      { href: "/broadcasts", label: "Broadcasts", icon: Send, enabled: true },
      { href: "/social", label: "Social Planner", icon: Share2, enabled: true },
      { href: "/idx", label: "IDX Listings", icon: Building, enabled: true },
      { href: "/marketing/ad-spend", label: "Ad Spend & Billing", icon: DollarSign, enabled: true },
    ],
  },
  {
    key: "grow",
    label: "Grow My Business",
    icon: Rocket,
    items: [
      { href: "/calendar", label: "Calendar", icon: Calendar, enabled: true },
      { href: "/booking", label: "Booking", icon: CalendarClock, enabled: true },
      { href: "/conversations", label: "Conversations", icon: MessagesSquare, enabled: true, badgeKey: "unreadConversations" },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, enabled: true, badgeKey: "dueToday" },
      { href: "/ai-agents", label: "AI Assistants", icon: Bot, enabled: true },
      { href: "/quotes", label: "Quotes", icon: FileSignature, enabled: true },
      { href: "/reports", label: "Analytics", icon: BarChart3, enabled: true },
    ],
  },
  {
    key: "setup",
    label: "Set Up My Business",
    icon: Wrench,
    items: [
      { href: "/launch-readiness", label: "Launch Readiness", icon: ClipboardCheck, enabled: true },
      { href: "/business-profile", label: "Business Blueprint", icon: BookOpen, enabled: true },
      { href: "/connect", label: "Connections", icon: Plug, enabled: true },
      { href: "/site-health", label: "Site Health", icon: HeartPulse, enabled: true, badgeKey: "siteHealth" },
      { href: "/media", label: "Media Library", icon: Images, enabled: true },
      { href: "/domain", label: "Domain", icon: Link2, enabled: true },
      { href: "/website-studio", label: "Website Studio", icon: LayoutTemplate, enabled: true },
      { href: "/templates", label: "Templates", icon: FileText, enabled: true },
      { href: "/products", label: "Products", icon: Package, enabled: true },
      { href: "/community", label: "Community", icon: GraduationCap, enabled: true },
      { href: "/logs", label: "Logs", icon: ScrollText, enabled: true },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, enabled: true },
    ],
  },
];

/* Keep legacy constant for backward compat if anything else imports it */
const SUB_ACCOUNT_NAV_SECTIONS: NavSection[] = [];

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function activeSubAccountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sa\/([^/]+)/);
  return match ? match[1] : null;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const dueToday = useDueTodayCount();
  const unreadConversations = useUnreadConversationsCount();
  const { agencyRole, memberships, membershipsLoaded, loading } = useAuth();
  const agency = useAgency();
  const activeSubId = activeSubAccountFromPath(pathname);
  const subRoot = activeSubId ? `/sa/${activeSubId}` : null;

  const [broadcastsGate, setBroadcastsGate] = useState<boolean | null>(null);
  const [websiteStudioGate, setWebsiteStudioGate] = useState<boolean | null>(
    null
  );
  const [socialGate, setSocialGate] = useState<boolean | null>(null);
  const [communityGate, setCommunityGate] = useState<boolean | null>(null);
  const [idxGate, setIdxGate] = useState<boolean | null>(null);
  const [broadcastsHidden, setBroadcastsHidden] = useState(false);
  const [socialHidden, setSocialHidden] = useState(false);
  const [communityHidden, setCommunityHidden] = useState(false);
  const [idxHidden, setIdxHidden] = useState(false);
  const [siteHealthScore, setSiteHealthScore] = useState<number | null>(null);

  useEffect(() => {
    const linkSubIdLocal = activeSubId ?? memberships[0]?.subAccountId ?? null;
    if (!linkSubIdLocal) {
      setBroadcastsGate(null);
      setWebsiteStudioGate(null);
      setSocialGate(null);
      setCommunityGate(null);
      setIdxGate(null);
      return;
    }
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", linkSubIdLocal),
      (snap) => {
        const data = snap.data();
        setBroadcastsGate(data?.broadcastsEnabledByAgency === true);
        setWebsiteStudioGate(data?.websiteStudioEnabledByAgency === true);
        setSocialGate(data?.socialPlannerEnabledByAgency === true);
        setCommunityGate(data?.communityEnabledByAgency === true);
        setIdxGate(data?.idxEnabledByAgency === true);
        setBroadcastsHidden(data?.broadcastsHiddenWhenDisabled === true);
        setSocialHidden(data?.socialPlannerHiddenWhenDisabled === true);
        setCommunityHidden(data?.communityHiddenWhenDisabled === true);
        setIdxHidden(data?.idxHiddenWhenDisabled === true);
      },
      () => {
        setBroadcastsGate(null);
        setWebsiteStudioGate(null);
        setSocialGate(null);
        setCommunityGate(null);
        setIdxGate(null);
      }
    );
  }, [activeSubId, memberships]);

  const fallbackSub = memberships[0]?.subAccountId ?? null;
  const linkSubId = activeSubId ?? fallbackSub;
  const showSubNav = !!linkSubId;

  useEffect(() => {
    if (!linkSubId) {
      setSiteHealthScore(null);
      return;
    }
    let active = true;
    void fetch(`/api/sub-accounts/${linkSubId}/site-health`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { score?: number };
        if (active && typeof data.score === "number") {
          setSiteHealthScore(data.score);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [linkSubId, pathname]);

  // Solo mode: outside multi-account mode, the brand line reads as the
  // workspace/sub-account name rather than the agency's — a single-operator
  // agency and its one workspace are the same thing to the user.
  const linkedMembership =
    memberships.find((m) => m.subAccountId === linkSubId) ?? null;
  const displayBrandName =
    !agency.multiAccountModeEnabled && linkedMembership?.name
      ? linkedMembership.name
      : agency.name;

  return (
    <div className="pl-safe flex h-full flex-col bg-[#4F6F9F] text-white">
      {/* Logo / brand */}
      <div className="flex h-16 items-center border-b border-white/20 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          {agency.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.logoUrl}
              alt={displayBrandName}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={30} idSuffix="-sidebar" tone="dark" />
          )}
          <span className="truncate text-sm font-semibold text-white">
            {displayBrandName}
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        onClick={(e) => {
          // Event delegation so the mobile Sheet drawer closes on any nav
          // link tap without threading an onNavigate prop through every
          // <SidebarLink> call site individually.
          if ((e.target as HTMLElement).closest("a")) onNavigate?.();
        }}
      >
        {/* Agency-level links.
         *
         * Shown to every owner, deliberately NOT gated on
         * `multiAccountModeEnabled` any more.
         *
         * That gate created a closed loop. Nothing writes the field at
         * provisioning — it is set only when an owner creates a SECOND
         * sub-account, and the only route to that page is
         * /agency/sub-accounts/new, which is linked exclusively from this
         * hidden nav. So for every new customer it was `undefined`, the nav
         * never appeared, and the page that would have set it was unreachable.
         *
         * The consequence reached well past this menu: the feature-gates
         * Manage dialog lives inside that nav, and the locked states for
         * Public API, Webhooks, Broadcasts, WhatsApp, Meta inbox, Outbound
         * Voice, Community and the email domain all read "ask your agency
         * administrator". For a solo buyer the administrator IS them — sent to
         * a door that did not exist.
         *
         * Solo mode still shapes the experience elsewhere: /agency itself
         * redirects a solo owner straight into their one workspace, so this
         * costs a solo owner nothing beyond having the entrance visible. */}
        {agencyRole === "owner" && (
          <div className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-white/70 uppercase">
              Agency
            </p>
            <SidebarLink
              href="/agency/get-started"
              label="Get started"
              icon={Compass}
              active={pathname.startsWith("/agency/get-started")}
            />
            <SidebarLink
              href="/agency"
              label="Agency home"
              icon={Building2}
              active={pathname === "/agency"}
            />
            <SidebarLink
              href="/agency/sub-accounts"
              label="Sub-accounts"
              icon={Users}
              active={pathname.startsWith("/agency/sub-accounts")}
            />
            <SidebarLink
              href="/agency/settings"
              label="Agency settings"
              icon={Settings}
              active={pathname.startsWith("/agency/settings")}
            />
          </div>
        )}

        {showSubNav && (
          <>
            <div className="mb-4">
              <button
                onClick={() => openAskAssistant()}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md bg-white/15 px-2 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6EA8FE] hover:text-[#102A4C]"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                Ask Zack
              </button>
            </div>

            {/* ── Primary nav items (flat, always visible) ── */}
            <div className="mb-2">
              {PRIMARY_NAV.map((item) => {
                const fullHref = `${subRoot ?? `/sa/${linkSubId}`}${item.href}`;
                const isActive =
                  pathname === fullHref ||
                  (item.href !== "/dashboard" && pathname.startsWith(fullHref));
                const badge =
                  item.badgeKey === "unreadConversations" && unreadConversations > 0
                    ? unreadConversations
                    : null;
                return (
                  <SidebarLink
                    key={item.href}
                    href={fullHref}
                    label={item.label}
                    icon={item.icon}
                    active={isActive}
                    badge={badge}
                  />
                );
              })}
            </div>

            {/* ── Expandable nav groups ── */}
            {NAV_GROUPS.map((group) => (
              <NavGroupSection
                key={group.key}
                group={group}
                subRoot={subRoot ?? `/sa/${linkSubId}`}
                pathname={pathname}
                dueToday={dueToday}
                unreadConversations={unreadConversations}
                siteHealthScore={siteHealthScore}
                broadcastsGate={broadcastsGate}
                websiteStudioGate={websiteStudioGate}
                socialGate={socialGate}
                communityGate={communityGate}
                idxGate={idxGate}
                broadcastsHidden={broadcastsHidden}
                socialHidden={socialHidden}
                communityHidden={communityHidden}
                idxHidden={idxHidden}
                multiAccountMode={agency.multiAccountModeEnabled}
              />
            ))}
          </>
        )}

        {!showSubNav && !loading && membershipsLoaded && (
          <p className="rounded-md border border-white/20 px-3 py-3 text-xs text-white/70">
            Pick a workspace from the switcher above to see its data.
          </p>
        )}
      </nav>

      {/* User footer */}
      <div className="pb-safe border-t border-white/20 p-3">
        {/* Removes itself once the app is installed. */}
        <div className="mb-2">
          <InstallCallout />
        </div>
        <button
          className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/85 transition-colors hover:bg-[#6EA8FE] hover:text-[#102A4C]"
          onClick={() => signOutUser()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function NavGroupSection({
  group,
  subRoot,
  pathname,
  dueToday,
  unreadConversations,
  siteHealthScore,
  broadcastsGate,
  websiteStudioGate,
  socialGate,
  communityGate,
  idxGate,
  broadcastsHidden,
  socialHidden,
  communityHidden,
  idxHidden,
  multiAccountMode,
}: {
  group: NavGroup;
  subRoot: string;
  pathname: string;
  dueToday: number;
  unreadConversations: number;
  siteHealthScore: number | null;
  broadcastsGate: boolean | null;
  websiteStudioGate: boolean | null;
  socialGate: boolean | null;
  communityGate: boolean | null;
  idxGate: boolean | null;
  broadcastsHidden: boolean;
  socialHidden: boolean;
  communityHidden: boolean;
  idxHidden: boolean;
  multiAccountMode: boolean;
}) {
  // Auto-expand if any child route is active
  const hasActiveChild = group.items.some((item) => {
    const fullHref = `${subRoot}${item.href}`;
    return pathname === fullHref || pathname.startsWith(fullHref);
  });
  const [expanded, setExpanded] = useState(hasActiveChild);

  // Sync expansion when route changes into this group
  useEffect(() => {
    if (hasActiveChild && !expanded) setExpanded(true);
  }, [hasActiveChild]); // eslint-disable-line react-hooks/exhaustive-deps

  const GroupIcon = group.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
          hasActiveChild
            ? "text-white"
            : "text-white/85 hover:bg-[#6EA8FE] hover:text-[#102A4C]"
        )}
      >
        <span className="flex items-center gap-2.5">
          <GroupIcon className="h-4 w-4 shrink-0" />
          {group.label}
        </span>
        <Chevron className="h-3.5 w-3.5 shrink-0 text-white/60" />
      </button>
      {expanded && (
        <div className="ml-2 border-l border-white/15 pl-1">
          {group.items.map((item) => {
            if (
              !multiAccountMode &&
              (item.href === "/quotes" || item.href === "/products")
            ) {
              return null;
            }

            const fullHref = `${subRoot}${item.href}`;
            const isActive =
              pathname === fullHref || pathname.startsWith(fullHref);

            const gateLocked =
              (item.href === "/broadcasts" && broadcastsGate === false) ||
              ((item.href === "/website-studio" || item.href === "/funnels") &&
                websiteStudioGate === false) ||
              (item.href === "/social" && socialGate === false) ||
              (item.href === "/community" && communityGate === false) ||
              (item.href === "/idx" && idxGate === false);

            const gateHidden =
              (item.href === "/broadcasts" &&
                broadcastsGate === false &&
                broadcastsHidden) ||
              (item.href === "/social" && socialGate === false && socialHidden) ||
              (item.href === "/community" &&
                communityGate === false &&
                communityHidden) ||
              (item.href === "/idx" && idxGate === false && idxHidden);

            if (gateHidden) return null;

            if (!item.enabled || gateLocked) {
              return (
                <div
                  key={item.href}
                  className="flex min-h-9 cursor-not-allowed items-center justify-between gap-2.5 rounded-md px-2 py-1 text-[13px] text-white/45"
                  title={
                    gateLocked
                      ? "Disabled by your agency administrator"
                      : "Coming soon"
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </span>
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 text-[10px] tracking-wide uppercase">
                    {gateLocked && <Lock className="h-2.5 w-2.5" />}
                    {gateLocked ? "Locked" : "Soon"}
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
                  : item.badgeKey === "siteHealth" && siteHealthScore !== null
                    ? `${siteHealthScore}%`
                    : null;

            return (
              <SidebarLink
                key={item.href}
                href={fullHref}
                label={item.label}
                icon={item.icon}
                active={isActive}
                badge={badge}
                compact
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  compact,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number | string | null;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2.5 rounded-md font-medium transition-colors",
        compact
          ? "min-h-9 px-2 py-1 text-[13px]"
          : "min-h-11 px-2 py-1.5 text-sm",
        active
          ? "bg-[#9CC8FF] text-[#102A4C] shadow-sm"
          : "text-white/85 hover:bg-[#6EA8FE] hover:text-[#102A4C]"
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {label}
      </span>
      {badge != null && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            active ? "bg-[#173B7A] text-white" : "bg-white/20 text-white"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 bg-[#4F6F9F] md:block">
        <SidebarContent />
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
