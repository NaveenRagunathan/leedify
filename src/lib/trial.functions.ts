import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const activateTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .single();

    if (profile?.status === "active" || profile?.status === "trial") {
      return { alreadyActive: true as const };
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from("profiles")
      .update({
        status: "trial",
        subscription_start: now.toISOString(),
        subscription_end: trialEnd.toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("Failed to activate trial:", error);
      throw new Error("Could not start trial. Please try again.");
    }

    return { alreadyActive: false as const };
  });
