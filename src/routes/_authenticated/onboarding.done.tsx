import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Mail, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding/done")({
  head: () => ({ meta: [{ title: "You're all set — Leadify" }] }),
  component: Done,
});

function Done() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime/15 text-lime">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">You're all set!</h1>
        <p className="mt-3 text-muted-foreground">
          Your subscription is active and your ICP is locked in.
        </p>

        <div className="mt-8 space-y-4 text-left">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-lime" />
            <div>
              <p className="text-sm font-semibold text-foreground">First leads arriving shortly</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your inbox — your first batch of 15 researched leads will be delivered to your email within minutes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-lime" />
            <div>
              <p className="text-sm font-semibold text-foreground">Then daily at 8 AM IST</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every morning you'll get 15 fresh, scored, and enriched leads — no repeats.
              </p>
            </div>
          </div>
        </div>

        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-lime px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-lime/90"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
