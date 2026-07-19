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
  Globe,
  Compass,
  Lock,
  Send,
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
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import { useDueTodayCount } from "@/hooks/use-due-today";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
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
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SUB_ACCOUNT_NAV_SECTIONS: NavSection[] = [
  {
    label: "Today",
    items: [{ href: "/dashboard", label: "Today", icon: Home, enabled: true }],
  },
  {
    label: "Clients",
    items: [
      {
        href: "/conversations",
        label: "Conversations",
        icon: MessagesSquare,
        enabled: true,
        badgeKey: "unreadConversations",
      },
      { href: "/contacts", label: "People", icon: Users, enabled: true },
      {
        href: "/pipeline",
        label: "Client Journeys",
        icon: GitBranch,
        enabled: true,
      },
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
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/forms", label: "Lead Capture", icon: FileText, enabled: true },
      {
        href: "/workflows",
        label: "Follow-Up Plans",
        icon: Workflow,
        enabled: true,
      },
      { href: "/funnels", label: "Marketing Pages", icon: Filter, enabled: true },
      { href: "/broadcasts", label: "Broadcasts", icon: Send, enabled: true },
      { href: "/social", label: "Social Planner", icon: Share2, enabled: true },
      { href: "/idx", label: "IDX Listings", icon: Building, enabled: true },
      { href: "/quotes", label: "Quotes", icon: FileSignature, enabled: true },
    ],
  },
  {
    label: "Business",
    items: [
      {
        href: "/business-profile",
        label: "Business Blueprint",
        icon: BookOpen,
        enabled: true,
      },
      { href: "/ai-agents", label: "AI Assistants", icon: Bot, enabled: true },
      {
        href: "/connect",
        label: "Connect Your Business",
        icon: Plug,
        enabled: true,
      },
      { href: "/products", label: "Products", icon: Package, enabled: true },
      { href: "/website", label: "Website", icon: Globe, enabled: true },
      { href: "/website-studio", label: "AI Website Studio", icon: LayoutTemplate, enabled: true },
      {
        href: "/community",
        label: "Community",
        icon: GraduationCap,
        enabled: true,
      },
      { href: "/templates", label: "Templates", icon: FileText, enabled: true },
      { href: "/reports", label: "Analytics", icon: BarChart3, enabled: true },
      { href: "/logs", label: "Logs", icon: ScrollText, enabled: true },
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        enabled: true,
      },
    ],
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const dueToday = useDueTodayCount();
  const unreadConversations = useUnreadConversationsCount();
  const { agencyRole, memberships, membershipsLoaded, loading } = useAuth();
  const agency = useAgency();
  const activeSubId = activeSubAccountFromPath(pathname);
  const subRoot = activeSubId ? `/sa/${activeSubId}` : null;

  const [broadcastsGate, setBroadcastsGate] = useState<boolean | null>(null);
  const [websiteGate, setWebsiteGate] = useState<boolean | null>(null);
  const [websiteStudioGate, setWebsiteStudioGate] = useState<boolean | null>(null);
  const [socialGate, setSocialGate] = useState<boolean | null>(null);
  const [communityGate, setCommunityGate] = useState<boolean | null>(null);
  const [idxGate, setIdxGate] = useState<boolean | null>(null);
  const [broadcastsHidden, setBroadcastsHidden] = useState(false);
  const [websiteHidden, setWebsiteHidden] = useState(false);
  const [socialHidden, setSocialHidden] = useState(false);
  const [communityHidden, setCommunityHidden] = useState(false);
  const [idxHidden, setIdxHidden] = useState(false);

  useEffect(() => {
    const linkSubIdLocal = activeSubId ?? memberships[0]?.subAccountId ?? null;
    if (!linkSubIdLocal) {
      setBroadcastsGate(null);
      setWebsiteGate(null);
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
        setWebsiteGate(data?.websiteEnabledByAgency === true);
        setWebsiteStudioGate(data?.websiteStudioEnabledByAgency === true);
        setSocialGate(data?.socialPlannerEnabledByAgency === true);
        setCommunityGate(data?.communityEnabledByAgency === true);
        setIdxGate(data?.idxEnabledByAgency === true);
        setBroadcastsHidden(data?.broadcastsHiddenWhenDisabled === true);
        setWebsiteHidden(data?.websiteHiddenWhenDisabled === true);
        setSocialHidden(data?.socialPlannerHiddenWhenDisabled === true);
        setCommunityHidden(data?.communityHiddenWhenDisabled === true);
        setIdxHidden(data?.idxHiddenWhenDisabled === true);
      },
      () => {
        setBroadcastsGate(null);
        setWebsiteGate(null);
        setWebsiteStudioGate(null);
        setSocialGate(null);
        setCommunityGate(null);
        setIdxGate(null);
      },
    );
  }, [activeSubId, memberships]);

  const fallbackSub = memberships[0]?.subAccountId ?? null;
  const linkSubId = activeSubId ?? fallbackSub;
  const showSubNav = !!linkSubId;

  // Solo Beta: outside multi-account mode, the brand line reads as the
  // workspace/sub-account name rather than the agency's — a single-operator
  // agency and its one workspace are the same thing to the user.
  const linkedMembership = memberships.find((m) => m.subAccountId === linkSubId) ?? null;
  const displayBrandName =
    !agency.multiAccountModeEnabled && linkedMembership?.name
      ? linkedMembership.name
      : agency.name;

  return (
    <div className="pl-safe flex h-full flex-col bg-[#0f1117] text-slate-300">
      {/* Logo / brand */}
      <div className="flex h-16 items-center border-b border-white/10 px-5">
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
        {/* Agency-level links — Solo Beta hides these until the agency has
            graduated to multi-account mode (see AgencyDoc.multiAccountModeEnabled) */}
        {agencyRole === "owner" && agency.multiAccountModeEnabled && (
          <div className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
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
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md bg-white/5 px-2 py-2 text-sm font-medium text-rose-300/90 transition-colors hover:bg-white/10 hover:text-rose-200"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                Ask AI
              </button>
            </div>
            {SUB_ACCOUNT_NAV_SECTIONS.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  const fullHref = `${subRoot ?? `/sa/${linkSubId}`}${item.href}`;
                  const isActive =
                    pathname === fullHref ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(fullHref));

                  const gateLocked =
                    (item.href === "/broadcasts" && broadcastsGate === false) ||
                    (item.href === "/website" && websiteGate === false) ||
                    ((item.href === "/website-studio" ||
                      item.href === "/funnels") &&
                      websiteStudioGate === false) ||
                    (item.href === "/social" && socialGate === false) ||
                    (item.href === "/community" && communityGate === false) ||
                    (item.href === "/idx" && idxGate === false);

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
                      communityHidden) ||
                    (item.href === "/idx" &&
                      idxGate === false &&
                      idxHidden);

                  if (gateHidden) return null;

                  if (!item.enabled || gateLocked) {
                    return (
                      <div
                        key={item.href}
                        className="flex min-h-11 cursor-not-allowed items-center justify-between gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/20"
                        title={
                          gateLocked
                            ? "Disabled by your agency administrator"
                            : "Coming soon"
                        }
                      >
                        <span className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </span>
                        <span className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 text-[10px] uppercase tracking-wide">
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
            ))}
          </>
        )}

        {!showSubNav && !loading && membershipsLoaded && (
          <p className="rounded-md border border-white/10 px-3 py-3 text-xs text-white/40">
            Pick a workspace from the switcher above to see its data.
          </p>
        )}
      </nav>

      {/* User footer */}
      <div className="pb-safe border-t border-white/10 p-3">
        <button
          className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
          onClick={() => signOutUser()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number | null;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center justify-between gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-blue-600/20 text-blue-400"
          : "text-white/50 hover:bg-white/5 hover:text-white/80",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {badge != null && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            active
              ? "bg-blue-500 text-white"
              : "bg-amber-500/20 text-amber-400",
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
      <aside className="hidden w-60 shrink-0 bg-[#0f1117] md:block">
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
