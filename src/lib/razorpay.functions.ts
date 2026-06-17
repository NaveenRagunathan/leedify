import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSecrets } from "@/lib/secrets.server";

/**
 * Creates a Razorpay subscription for the current user and stores its id on the profile.
 * Returns the data needed to open Razorpay Checkout on the client.
 */
export const createRazorpaySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_PLAN_ID: planId } =
      await getSecrets(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_PLAN_ID"]);

    const { supabase, userId } = context;

    // Reuse existing subscription if we already created one and it's not active yet.
    const { data: profile } = await supabase
      .from("profiles")
      .select("razorpay_sub_id, status, name")
      .eq("id", userId)
      .single();

    if (profile?.status === "active" && profile.razorpay_sub_id) {
      return { alreadyActive: true as const };
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    let subscriptionId = profile?.razorpay_sub_id ?? null;

    if (!subscriptionId) {
      const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: planId,
          customer_notify: 1,
          total_count: 120, // 10 years of monthly cycles
          notes: { user_id: userId },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Razorpay create subscription failed", res.status, text);
        throw new Error("Could not create subscription. Please try again.");
      }

      const sub = (await res.json()) as { id: string; short_url: string };
      subscriptionId = sub.id;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ razorpay_sub_id: subscriptionId })
        .eq("id", userId);
      if (updateErr) {
        console.error("Could not store subscription id", updateErr);
      }

      return {
        alreadyActive: false as const,
        subscriptionId,
        paymentUrl: sub.short_url,
      };
    }

    // Existing subscription — fetch its short_url
    const subRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const subData = (await subRes.json()) as { short_url: string };

    return {
      alreadyActive: false as const,
      subscriptionId,
      paymentUrl: subData.short_url,
    };
  });
