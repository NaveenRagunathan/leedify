import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signup", "login"]).catch("signup"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Leadify" },
      { name: "description", content: "Sign in or create your Leadify account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/onboarding", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: { name },
          },
        });
        if (error) throw error;
        toast.success("Account created — let's set up your ICP.");
        navigate({ to: "/onboarding", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        navigate({ to: "/onboarding", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-lime/10 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex flex-1 flex-col justify-center">
          <div className="rounded-2xl border border-border bg-surface p-8 shadow-2xl shadow-black/30">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">
                {isSignup ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSignup ? "Start receiving 15 leads daily on WhatsApp." : "Sign in to your Leadify dashboard."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <Field label="Name">
                  <input
                    required type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="input" placeholder="Naveen Ragunathan" maxLength={80}
                  />
                </Field>
              )}
              <Field label="Email">
                <input
                  required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input" placeholder="you@example.com" maxLength={120}
                />
              </Field>
              <Field label="Password">
                <input
                  required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input" placeholder="••••••••" minLength={8} maxLength={120}
                />
              </Field>

              <button
                type="submit" disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-lime px-4 py-2.5 text-sm font-semibold text-lime-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSignup ? "Create account" : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account?" : "New to Leadify?"}{" "}
              <Link to="/auth" search={{ mode: isSignup ? "login" : "signup" }} className="font-medium text-lime hover:underline">
                {isSignup ? "Sign in" : "Create one"}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: var(--color-foreground);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          border-color: var(--color-lime);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lime) 20%, transparent);
        }
        .input::placeholder { color: var(--color-muted-foreground); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
