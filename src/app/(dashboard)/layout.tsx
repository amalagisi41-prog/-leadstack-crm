"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { CommandPalette } from "@/components/search/command-palette";
import { AskAssistantPanel } from "@/components/dashboard/ask-assistant-panel";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const section = pathname
      .split("/")
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/[-_]/g, " ");
    const labels: Record<string, string> = {
      dashboard: "Today",
      contacts: "Contacts",
      conversations: "Conversations",
      pipeline: "Pipeline",
      tasks: "Tasks",
      calendar: "Calendar",
      forms: "Lead Capture",
      funnels: "Funnels",
      reports: "Reports",
      settings: "Settings",
      booking: "Booking",
      media: "Media",
      social: "Social Planner",
      community: "Community",
      workflows: "Workflows",
      products: "Products",
      quotes: "Quotes",
      website: "Website",
      "website studio": "Website Studio",
      idx: "IDX Listings",
      import: "Import",
    };
    document.title = `${labels[section ?? ""] ?? (section ? section.replace(/\b\w/g, (char) => char.toUpperCase()) : "AgentStack")} · AgentStack`;
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <InstallPrompt />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <AskAssistantPanel />
    </div>
  );
}
