import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSecret } = await import("@/lib/secrets.server");
        let secret: string;
        try {
          secret = await getSecret("RAZORPAY_WEBHOOK_SECRET");
        } catch {
          console.error("Missing RAZORPAY_WEBHOOK_SECRET in app_secrets");
          return new Response("Server misconfigured", { status: 500 });
        }

        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();

        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const event = payload?.event as string | undefined;
        const subscription = payload?.payload?.subscription?.entity;
        const subscriptionId = subscription?.id as string | undefined;

        if (!event || !subscriptionId) {
          return new Response("ok"); // Ignore unrelated events
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const toIso = (s?: number | null) =>
          typeof s === "number" ? new Date(s * 1000).toISOString() : null;

        if (
          event === "subscription.activated" ||
          event === "subscription.charged" ||
          event === "subscription.resumed"
        ) {
          const { data: updatedUsers, error } = await supabaseAdmin
            .from("profiles")
            .update({
              status: "active",
              subscription_start: toIso(subscription.current_start) ?? new Date().toISOString(),
              subscription_end: toIso(subscription.current_end),
            })
            .eq("razorpay_sub_id", subscriptionId)
            .select("id");
          if (error) {
            console.error("Webhook update failed", error);
            return new Response("DB error", { status: 500 });
          }

          // Trigger Day 1 lead generation for newly activated user
          if (event === "subscription.activated" && updatedUsers?.[0]) {
            const { runPipelineForUser } = await import("@/lib/pipeline.server");
            // Run async — don't block webhook response
            runPipelineForUser(updatedUsers[0].id).catch((e) =>
              console.error("Day 1 pipeline failed:", e)
            );
          }
        } else if (event === "subscription.paused" || event === "subscription.halted") {
          await supabaseAdmin
            .from("profiles")
            .update({ status: "paused" })
            .eq("razorpay_sub_id", subscriptionId);
        } else if (event === "subscription.cancelled" || event === "subscription.completed") {
          await supabaseAdmin
            .from("profiles")
            .update({ status: "cancelled" })
            .eq("razorpay_sub_id", subscriptionId);
        }

        return new Response("ok");
      },
    },
  },
});
