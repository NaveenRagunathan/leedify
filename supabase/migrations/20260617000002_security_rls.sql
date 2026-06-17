
-- ============================================
-- Security: Add RLS to tables missing it
-- ============================================

-- LEADS table
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- EMAIL_MESSAGES table
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own email messages"
  ON public.email_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;

-- APP_SECRETS table - service_role ONLY
ALTER TABLE public.app_secrets ENABLE ROW LEVEL security;

-- Only service_role can access app_secrets (no authenticated user policies)
-- This prevents accidental exposure via client SDK
-- Revoke any accidental grants to authenticated/anon
REVOKE ALL ON public.app_secrets FROM authenticated, anon, public;
GRANT ALL ON public.app_secrets TO service_role;

-- PROFILES: remove DELETE grant (no user-facing delete UI)
REVOKE DELETE ON public.profiles FROM authenticated;
