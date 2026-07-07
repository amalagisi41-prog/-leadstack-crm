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
  LayoutTemplate,
  ScrollText,
  MessagesSquare,
  Share2,
  GraduationCap,
  Filter,
  BookOpen,
  ChevronDown,
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
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SUB_ACCOUNT_NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
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
      { href: "/quotes", label: "Quotes", icon: FileSignature, enabled: true },
    ],
  },
  {
    label: "AI & Automation",
    items: [
      {
        href: "/business-profile",
        label: "Business Profile",
        icon: BookOpen,
        enabled: true,
      },
      { href: "/ai-agents", label: "AI Receptionist", icon: Bot, enabled: true },
      { href: "/workflows", label: "Workflows", icon: Workflow, enabled: true },
      { href: "/broadcasts", label: "Broadcasts", icon: Send, enabled: true },
      { href: "/templates", label: "Templates", icon: FileText, enabled: true },
    ],
  },
  {
    label: "Performance",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, enabled: true },
      { href: "/logs", label: "Logs", icon: ScrollText, enabled: true },
    ],
  },
  {
    label: "Brokerage",
    items: [
      { href: "/products", label: "Products", icon: Package, enabled: true },
      { href: "/website", label: "Website", icon: Globe, enabled: true },
      { href: "/website-studio", label: "Website Studio", icon: LayoutTemplate, enabled: true },
      { href: "/funnels", label: "Sales Funnels", icon: Filter, enabled: true },
      { href: "/social", label: "Social Planner", icon: Share2, enabled: true },
      {
        href: "/community",
        label: "Community",
        icon: GraduationCap,
        enabled: true,
      },
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

function SidebarContent() {
  const pathname = usePathname();
  const dueToday = useDueTodayCount();
  const unreadConversations = useUnreadConversationsCount();
  const { agencyRole, memberships, loading } = useAuth();
  const agency = useAgency();
  const activeSubId = activeSubAccountFromPath(pathname);
  const subRoot = activeSubId ? `/sa/${activeSubId}` : null;

  const [broadcastsGate, setBroadcastsGate] = useState<boolean | null>(null);
  const [websiteGate, setWebsiteGate] = useState<boolean | null>(null);
  const [websiteStudioGate, setWebsiteStudioGate] = useState<boolean | null>(null);
  const [socialGate, setSocialGate] = useState<boolean | null>(null);
  const [communityGate, setCommunityGate] = useState<boolean | null>(null);
  const [broadcastsHidden, setBroadcastsHidden] = useState(false);
  const [websiteHidden, setWebsiteHidden] = useState(false);
  const [socialHidden, setSocialHidden] = useState(false);
  const [communityHidden, setCommunityHidden] = useState(false);

  useEffect(() => {
    const linkSubIdLocal = activeSubId ?? memberships[0]?.subAccountId ?? null;
    if (!linkSubIdLocal) {
      setBroadcastsGate(null);
      setWebsiteGate(null);
      setWebsiteStudioGate(null);
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
        setWebsiteStudioGate(data?.websiteStudioEnabledByAgency === true);
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
        setWebsiteStudioGate(null);
        setSocialGate(null);
        setCommunityGate(null);
      },
    );
  }, [activeSubId, memberships]);

  const fallbackSub = memberships[0]?.subAccountId ?? null;
  const linkSubId = activeSubId ?? fallbackSub;
  const showSubNav = !!linkSubId;

  return (
    <div className="flex h-full flex-col bg-[#0f1117] text-slate-300">
      {/* Logo / brand */}
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          {agency.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.logoUrl}
              alt={agency.name}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={30} idSuffix="-sidebar" />
          )}
          <span className="truncate text-sm font-semibold text-white">
            {agency.name}
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Agency-level links */}
        {(agencyRole === "owner" || memberships.length > 1) && (
          <div className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Agency
            </p>
            {agencyRole === "owner" && (
              <SidebarLink
                href="/agency/get-started"
                label="Get started"
                icon={Compass}
                active={pathname.startsWith("/agency/get-started")}
              />
            )}
            <SidebarLink
              href="/agency"
              label="Agency home"
              icon={Building2}
              active={pathname === "/agency"}
            />
            {agencyRole === "owner" && (
              <SidebarLink
                href="/agency/sub-accounts"
                label="Sub-accounts"
                icon={Users}
                active={pathname.startsWith("/agency/sub-accounts")}
              />
            )}
            {agencyRole === "owner" && (
              <SidebarLink
                href="/agency/settings"
                label="Agency settings"
                icon={Settings}
                active={pathname.startsWith("/agency/settings")}
              />
            )}
          </div>
        )}

        {showSubNav && (
          <>
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
                    (item.href === "/community" && communityGate === false);

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
                    return (
                      <div
                        key={item.href}
                        className="flex cursor-not-allowed items-center justify-between gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/20"
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

        {!showSubNav && !loading && (
          <p className="rounded-md border border-white/10 px-3 py-3 text-xs text-white/40">
            Pick a sub-account from{" "}
            <Link href="/agency" className="text-blue-400 underline">
              Agency home
            </Link>{" "}
            to see its data.
          </p>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
        "flex items-center justify-between gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
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
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
