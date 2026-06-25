import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";

/**
 * Public docs page — "Keeping your app up to date with the org build".
 *
 * Buyer-facing guide for buyers who cloned the org repo, pushed to their own
 * GitHub, customised the app, and now want to pull a newer org release into
 * their fork without losing their changes. Linked from the post-purchase
 * /thank-you page and intended to be a stable URL the buyer can bookmark and
 * come back to weeks/months later. Public (no auth) — listed in
 * middleware.ts PUBLIC_PATHS under "/docs".
 */

export const metadata = {
  title: "Keeping your app up to date — LeadStack",
  description:
    "How to pull the latest official LeadStack build into your own customised version of the app — without losing your changes.",
};

export default function UpdatingDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <LogoMark size={20} idSuffix="-docs" />
            LeadStack
          </Link>
          <Button render={<Link href="/" />} variant="outline" size="sm">
            Back to home
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl flex-1 px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Docs · Maintenance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Keeping your app up to date with the org build
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          How to pull the latest official LeadStack build into your own
          customised version of the app — without losing the changes you&apos;ve
          made.
        </p>

        <Section title="The mental model" id="mental-model">
          <p>There are three things in play:</p>
          <div className="my-5 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">What it is</th>
                  <th className="px-4 py-2 text-left font-medium">Git term</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-3 font-semibold">Org repo</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The official LeadStack build. A read-only{" "}
                    <em>snapshot</em> you don&apos;t push to.
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>upstream</InlineCode>
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 font-semibold">Your fork</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Your personal copy on GitHub, where your work lives.
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>origin</InlineCode>
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 font-semibold">
                    Your customisations
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    The edits you make on your <InlineCode>main</InlineCode>{" "}
                    branch.
                  </td>
                  <td className="px-4 py-3">your commits</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Callout>
            The org repo is published as a <strong>single snapshot commit</strong>{" "}
            that gets replaced each release. It has no shared history with your
            fork, so you <strong>cannot</strong> just <InlineCode>git pull</InlineCode>{" "}
            from it. The steps below give git the shared reference point it needs
            to merge cleanly.
          </Callout>
        </Section>

        <Section title="One-time setup (do this once per machine)" id="setup">
          <CodeBlock>{`# 1. Add the org repo as a second remote called "upstream"
git remote add upstream https://github.com/Claude-Code-Pro-Camp/leadstack-agency.git

# 2. Fetch its current snapshot
git fetch upstream

# 3. Create a local "vendor" branch that mirrors the org snapshot.
#    This branch is the shared reference point for future merges.
git branch vendor upstream/main`}</CodeBlock>

          <p>You now have:</p>
          <ul className="my-3 list-disc space-y-1 pl-6 text-sm">
            <li>
              <InlineCode>origin</InlineCode> → your fork (where you push)
            </li>
            <li>
              <InlineCode>upstream</InlineCode> → the org repo (read-only)
            </li>
            <li>
              a <InlineCode>vendor</InlineCode> branch tracking the org snapshots
            </li>
          </ul>
        </Section>

        <Section title="Each time you want the latest org build" id="updating">
          <p>
            Always start from a <strong>clean working tree</strong> — commit or
            stash your work first.
          </p>
          <CodeBlock>{`# 1. Get the newest org snapshot
git fetch upstream

# 2. Move the vendor branch up to the new snapshot's contents
git checkout vendor
git read-tree -u --reset upstream/main
git commit -m "vendor: latest org snapshot"

# 3. Merge it into your own branch (this preserves YOUR changes)
git checkout main
git merge vendor

# 4. Refresh dependencies in case they changed
pnpm install`}</CodeBlock>
          <p>That&apos;s it. Your customisations and the new org code are now combined.</p>
        </Section>

        <Section title="If you see merge conflicts" id="conflicts">
          <p>
            A conflict only happens where <strong>you and the org edited the same lines</strong>.
            Git marks them like this:
          </p>
          <CodeBlock>{`<<<<<<< HEAD
your version
=======
org version
>>>>>>> vendor`}</CodeBlock>
          <p>To resolve:</p>
          <ol className="my-3 list-decimal space-y-2 pl-6 text-sm">
            <li>
              Open each conflicted file and edit it to the version you want
              (delete the <InlineCode>{"<<<<<<<"}</InlineCode>,{" "}
              <InlineCode>=======</InlineCode>, <InlineCode>{">>>>>>>"}</InlineCode>{" "}
              markers).
            </li>
            <li>Then finish the merge:</li>
          </ol>
          <CodeBlock>{`git add -A
git commit`}</CodeBlock>
          <Tip>
            <InlineCode>git status</InlineCode> always lists which files still
            need attention.
          </Tip>
        </Section>

        <Section title="After updating — don't forget" id="checklist">
          <ul className="my-3 space-y-2 pl-6 text-sm">
            <li className="list-disc">
              <strong>
                <InlineCode>pnpm install</InlineCode>
              </strong>{" "}
              — pulls any new dependencies the update added.
            </li>
            <li className="list-disc">
              <strong>
                Check <InlineCode>.env.example</InlineCode>
              </strong>{" "}
              — new features sometimes add new environment variables. Compare it
              against your real <InlineCode>.env</InlineCode> and fill in
              anything new.
            </li>
            <li className="list-disc">
              <strong>Test the app</strong> (<InlineCode>pnpm dev</InlineCode>)
              before pushing.
            </li>
            <li className="list-disc">
              <strong>Push to your fork</strong> when happy:{" "}
              <InlineCode>git push origin main</InlineCode>
              <br />
              <em className="text-muted-foreground">
                (This goes to YOUR repo, never the org repo.)
              </em>
            </li>
          </ul>
        </Section>

        <Section title="Quick reference" id="quick-reference">
          <div className="my-5 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">I want to…</th>
                  <th className="px-4 py-2 text-left font-medium">Command</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-3">
                    See my branches and where they point
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>git branch -vv</InlineCode>
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">See which remotes I have</td>
                  <td className="px-4 py-3">
                    <InlineCode>git remote -v</InlineCode>
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">Check for uncommitted work</td>
                  <td className="px-4 py-3">
                    <InlineCode>git status</InlineCode>
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">Get the latest org build</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    the 4 steps above
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">Preview what a push would send</td>
                  <td className="px-4 py-3">
                    <InlineCode>git push --dry-run origin main</InlineCode>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Common questions" id="faq">
          <FaqItem question="Does pushing send my code to the org repo?">
            No. <InlineCode>git push</InlineCode> goes to{" "}
            <InlineCode>origin</InlineCode> — your personal fork. The org repo
            is <InlineCode>upstream</InlineCode> and is read-only to you.
          </FaqItem>
          <FaqItem question="What if I haven't customised anything yet?">
            The merge still works; there just won&apos;t be any conflicts.
          </FaqItem>
          <FaqItem question="I messed up a merge — how do I bail out?">
            Before committing: <InlineCode>git merge --abort</InlineCode>{" "}
            returns you to where you started.
          </FaqItem>
        </Section>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          Need a hand?{" "}
          <Link href="/" className="text-foreground underline hover:no-underline">
            Get in touch
          </Link>{" "}
          — we&apos;re happy to walk you through it.
        </footer>
      </main>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 scroll-mt-20" id={id}>
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-[12.5px] leading-relaxed">
      <code className="font-mono text-foreground">{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-lg border-l-2 border-primary/40 bg-muted/30 py-2 pl-3 text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">Tip: </span>
      {children}
    </div>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-4">
      <p className="font-semibold">{question}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}
