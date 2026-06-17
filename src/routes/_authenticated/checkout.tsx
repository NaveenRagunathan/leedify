import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { createRazorpaySubscription } from "@/lib/razorpay.functions";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "Activate your subscription — Leadify" }] }),
  component: Checkout,
});

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = RAZORPAY_SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function Checkout() {
  const navigate = useNavigate();
  const createSub = useServerFn(createRazorpaySubscription);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "active" | "pending">("idle");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    void loadRazorpay();
    void refreshStatus();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function refreshStatus() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("status").eq("id", user.id).single();
    if (data?.status === "active") {
      setStatus("active");
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }

  function startPolling() {
    setStatus("pending");
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(refreshStatus, 3000);
  }

  async function handlePay() {
    setLoading(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Could not load Razorpay. Check your connection.");

      const res = await createSub();

      if (res.alreadyActive) {
        setStatus("active");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      const rzp = new window.Razorpay({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: "Leadify",
        description: "15 researched leads per day",
        theme: { color: "#0A0F1F" },
        prefill: {
          name: res.customerName || undefined,
          email: user?.email,
        },
        handler: () => {
          toast.success("Payment received. Activating your account…");
          startPolling();
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      rzp.on("payment.failed", (resp: any) => {
        console.error("Razorpay payment failed", resp);
        toast.error("Payment failed. Please try again.");
        setLoading(false);
      });

      rzp.open();
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-lime">Final step</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Activate your daily leads</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          15 researched, scored, and enriched leads delivered to your WhatsApp every morning at 8am IST.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-background p-5">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight">₹499</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-foreground/80">
            {["15 leads/day", "LinkedIn + email + phone", "Lead score & rationale", "Cancel anytime"].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-lime" strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {status === "active" ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-foreground">
              <Check className="h-4 w-4 text-lime" strokeWidth={2.5} />
              Subscription active. You're all set.
            </div>
            <button
              onClick={() => navigate({ to: "/onboarding/done" })}
              className="w-full rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-background transition hover:bg-lime/90"
            >
              Continue
            </button>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={loading || status === "pending"}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-lime px-4 py-3 text-sm font-semibold text-background transition hover:bg-lime/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || status === "pending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status === "pending" ? "Confirming payment…" : "Opening checkout…"}
              </>
            ) : (
              "Pay ₹499 & activate"
            )}
          </button>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Secure payments by Razorpay. Cancel anytime from your dashboard.
        </p>
      </div>
    </div>
  );
}
