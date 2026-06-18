import { createFileRoute } from "@tanstack/react-router";

/**
 * 8 AM cron endpoint: sends emails for all pending leads generated at 12 AM.
 *
 * POST /api/public/send-emails
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export const Route = createFileRoute("/api/public/send-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

        const { getSecret } = await import("@/lib/secrets.server");
        let cronSecret: string;
        try {
          cronSecret = await getSecret("CRON_SECRET");
        } catch {
          cronSecret = "";
        }

        if (!cronSecret || secret !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { sendEmailsForAllUsers } = await import("@/lib/pipeline.server");
        const results = await sendEmailsForAllUsers();

        return new Response(
          JSON.stringify({
            ok: true,
            usersProcessed: results.length,
            results: results.map((r) => ({
              userId: r.userId,
              leadsSent: r.leadsSent,
              emailSent: r.emailSent,
              error: r.error || null,
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
