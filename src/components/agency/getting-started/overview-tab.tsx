import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  CheckSquare,
  FileEdit,
  GitBranch,
  Globe,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  PartyPopper,
  Send,
  Sparkles,
  User,
  UserPlus,
  Users,
  Wand2,
  Workflow,
  Mail,
} from "lucide-react";
import { WorkflowDiagram } from "./workflow-diagram";

/**
 * Tab 1 — Welcome + four illustrated workflows. Static content; no data
 * fetching. The four workflows mirror the headline stories in CLAUDE.md so
 * the operator's mental model lines up with the codebase.
 *
 * `agencyName` comes from useAgency() upstream so the white-label brand
 * shows through (the LeadStack deployment resolves it to "LeadStack"; a
 * rebranded buyer's resolves to their own name).
 */
export function OverviewTab({ agencyName }: { agencyName: string }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <PartyPopper className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Welcome to {agencyName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An agency CRM in a box: capture leads with hosted forms,
              respond instantly with automations, manage the whole sales
              pipeline, and stand up client marketing sites — each client
              isolated in their own sub-account workspace.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">How {agencyName} works</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowCard
            title="Multi-tenant agency model"
            description="Your agency is the parent. Each client is a sub-account with its own contacts, deals, forms, and members. Switch between them from the header."
          >
            <WorkflowDiagram
              steps={[
                {
                  icon: Building2,
                  label: "Agency",
                  detail: "You",
                  tone: "indigo",
                },
                {
                  icon: Users,
                  label: "Sub-accounts",
                  detail: "One per client",
                  tone: "violet",
                },
                {
                  icon: UserPlus,
                  label: "Members",
                  detail: "Admins + collaborators",
                  tone: "pink",
                },
              ]}
            />
          </WorkflowCard>

          <WorkflowCard
            title="Lead capture & instant response"
            description="A visitor submits a form. The contact gets created, the matching automation fires, and within seconds they receive an SMS and email reply — while the lead lands at the top of your pipeline."
            highlight
          >
            <WorkflowDiagram
              steps={[
                {
                  icon: FileEdit,
                  label: "Form submit",
                  detail: "Public or embedded",
                  tone: "indigo",
                },
                {
                  icon: UserPlus,
                  label: "Contact created",
                  detail: "Pipeline: New",
                  tone: "violet",
                },
                {
                  icon: Wand2,
                  label: "Automation fires",
                  detail: "Trigger: form-submitted",
                  tone: "pink",
                },
                {
                  icon: MessageSquare,
                  label: "SMS + Email",
                  detail: "Sent to the lead",
                  tone: "emerald",
                },
                {
                  icon: Bell,
                  label: "Owner notified",
                  detail: "Static recipient",
                  tone: "amber",
                },
              ]}
            />
          </WorkflowCard>

          <WorkflowCard
            title="AI Agents (Voice + SMS + Web Chat)"
            description="Configure one persona that powers every channel. Voice calls answer the sub-account's phone number; SMS auto-replies route through the same number; the Web Chat widget embeds on the client's site. When the bot captures a name/email/phone — by voice, text, or chat form — a Contact is created, a follow-up Task is added to today's queue, and the escalation email fires."
            highlight
          >
            <WorkflowDiagram
              steps={[
                {
                  icon: MessageCircle,
                  label: "Visitor reaches out",
                  detail: "Call, text, or chat",
                  tone: "indigo",
                },
                {
                  icon: Bot,
                  label: "AI replies",
                  detail: "Persona + KB",
                  tone: "violet",
                },
                {
                  icon: User,
                  label: "Lead captured",
                  detail: "In conversation",
                  tone: "pink",
                },
                {
                  icon: CheckSquare,
                  label: "Task created",
                  detail: "Due today",
                  tone: "amber",
                },
                {
                  icon: Bell,
                  label: "Owner notified",
                  detail: "Email + console",
                  tone: "emerald",
                },
              ]}
            />
          </WorkflowCard>

          <WorkflowCard
            title="Client website builder"
            description="Each sub-account can publish a marketing site via gitpage.site. Fill the form (or click Sample), build, get a live URL, and embed your forms back into it."
          >
            <WorkflowDiagram
              steps={[
                {
                  icon: FileEdit,
                  label: "Fill the form",
                  detail: "Or click Sample",
                  tone: "indigo",
                },
                {
                  icon: Sparkles,
                  label: "gitpage builds",
                  detail: "1–3 minutes",
                  tone: "violet",
                },
                {
                  icon: Globe,
                  label: "Live URL",
                  detail: "Hosted by gitpage",
                  tone: "emerald",
                },
                {
                  icon: MousePointerClick,
                  label: "Embed forms",
                  detail: "Loop back to capture",
                  tone: "pink",
                },
              ]}
            />
          </WorkflowCard>

          <WorkflowCard
            title="Pipeline → Reports"
            description="Drag deals through stages on the Kanban board. Reports update automatically — funnel, won-revenue, leads-by-source — all date-rangeable."
          >
            <WorkflowDiagram
              steps={[
                {
                  icon: GitBranch,
                  label: "Drag through stages",
                  detail: "New → Won",
                  tone: "indigo",
                },
                {
                  icon: Send,
                  label: "Activity logged",
                  detail: "Per contact timeline",
                  tone: "violet",
                },
                {
                  icon: Mail,
                  label: "Manual follow-ups",
                  detail: "Email + SMS",
                  tone: "pink",
                },
                {
                  icon: BarChart3,
                  label: "Reports update",
                  detail: "Funnel + revenue",
                  tone: "emerald",
                },
              ]}
            />
          </WorkflowCard>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Workflow className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">A typical first session</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify your integrations on the Status tab, create a sub-account
              for your first client, build a form, attach the Instant Lead
              Response automation, and embed it on a website. From there
              every form submit kicks off the whole loop on its own.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkflowCard({
  title,
  description,
  highlight,
  children,
}: {
  title: string;
  description: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={
        highlight
          ? "rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 lg:col-span-2"
          : "rounded-2xl border bg-card p-5"
      }
    >
      <header className="mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </header>
      {children}
    </article>
  );
}
