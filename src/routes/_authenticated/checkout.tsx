import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { createRazorpaySubscription } from "@/lib/razorpay.functions";
import { activateTrial } from "@/lib/trial.functions";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "Start your free trial — Leadify" }] }),
  component: Checkout,
});

function Checkout() {
  const navigate = useNavigate();
  const createSub = useServerFn(createRazorpaySubscription);
  const startTrial = useServerFn(activateTrial);
  const [loading, setLoading] = useState<"trial" | "pay" | null>(null);
  const [status, setStatus] = useState<"idle" | "active" | "trial" | "pending_payment">("idle");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    void refreshStatus();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function refreshStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("status").eq("id", user.id).single();
    if (data?.status === "active" || data?.status === "trial") {
      setStatus(data.status);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }

  function startPolling() {
    setLoading("pay");
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(refreshStatus, 3000);
  }

  async function handleStartTrial() {
    setLoading("trial");
    try {
      const res = await startTrial();
      if (res.alreadyActive) {
        setStatus("active");
        return;
      }
      setStatus("trial");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
      setLoading(null);
    }
  }

  async function handlePay() {
    setLoading("pay");
    try {
      const res = await createSub();
      if (res.alreadyActive) {
        setStatus("active");
        return;
      }
      startPolling();
      window.location.href = res.paymentUrl;
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
      setLoading(null);
    }
  }

  const active = status === "active" || status === "trial";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-lime">Final step</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Start receiving leads</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          15 researched, scored, and enriched leads delivered to your inbox every morning at 8am IST.
        </p>

        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-lime/30 bg-lime/[0.04] p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-lime" />
              <span className="text-sm font-semibold">7-day free trial</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              No credit card required. Full access. Cancel anytime.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
              {["15 leads/day", "LinkedIn + email + phone", "Lead score & rationale"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-lime" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">₹499</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">after trial ends</p>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
              {["Daily leads forever", "Priority support"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-lime" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {active ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-foreground">
              <Check className="h-4 w-4 text-lime" strokeWidth={2.5} />
              {status === "trial" ? "Your 7-day trial is active. Leads start arriving now." : "Subscription active. You're all set."}
            </div>
            <button
              onClick={() => navigate({ to: "/onboarding/done" })}
              className="w-full rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-background transition hover:bg-lime/90"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <button
              onClick={handleStartTrial}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-background transition hover:bg-lime/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "trial" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Starting your trial…</>
              ) : (
                "Start 7-day free trial"
              )}
            </button>
            <button
              onClick={handlePay}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "pay" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Razorpay…</>
              ) : (
                "Pay ₹499/month now"
              )}
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Cancel anytime. No credit card needed for trial.
        </p>
      </div>
    </div>
  );
}
