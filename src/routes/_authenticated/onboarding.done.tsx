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
          One last step: activate your subscription and we'll start delivering 15 researched leads every morning at 8am IST.
        </p>
        <Link
          to="/checkout"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-lime px-5 py-2.5 text-sm font-semibold text-background transition hover:bg-lime/90"
        >
          Continue to payment →
        </Link>
      </div>
    </div>
  );
}
