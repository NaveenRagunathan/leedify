import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding/done")({
  head: () => ({ meta: [{ title: "ICP saved — Leadify" }] }),
  component: Done,
});

function Done() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime/15 text-lime">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Your ICP is locked in.</h1>
        <p className="mt-3 text-muted-foreground">
          Next up: payment, WhatsApp connection, and your first batch of 15 leads. We'll wire those up in the next milestone.
        </p>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-lime/40">
          Back to home
        </Link>
      </div>
    </div>
  );
}
