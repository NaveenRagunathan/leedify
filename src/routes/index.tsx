import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle, Mail, Target, Sparkles, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Leadify — 15 qualified leads. Every morning. In your inbox." },
      { name: "description", content: "Tell us your ideal customer once. We research, score and enrich 15 leads daily — delivered straight to your inbox at 8am IST." },
      { property: "og:title", content: "Leadify — Daily qualified leads in your inbox" },
      { property: "og:description", content: "15 researched, scored and enriched leads delivered to your inbox every morning." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-lime text-lime-foreground font-bold">L</span>
          <span className="text-base font-semibold tracking-tight">Leadify</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/auth" search={{ mode: "login" }} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-1.5 rounded-md bg-lime px-4 py-2 text-sm font-semibold text-lime-foreground transition hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute left-1/2 top-0 -z-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-lime/10 blur-[120px]" />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
            Live · Next batch in 4h 12m
          </div>
          <h1 className="mt-6 text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            15 qualified leads.
            <br />
            Every morning. <span className="text-lime">In your inbox.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
            Tell us your ideal customer once. We research, score and enrich — LinkedIn URL, email and phone — delivered to your inbox by 8&nbsp;AM IST.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group inline-flex items-center gap-2 rounded-md bg-lime px-6 py-3.5 text-base font-semibold text-lime-foreground transition hover:opacity-90"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <p className="text-sm text-muted-foreground">No credit card · 7-day free trial · ₹499/month after</p>
          </div>
        </div>

        <SampleLeadCard />
      </div>
    </section>
  );
}

function SampleLeadCard() {
  return (
    <div className="relative mx-auto mt-20 max-w-md">
      <div className="absolute -inset-6 -z-0 rounded-3xl bg-lime/10 blur-2xl" />
      <div className="relative rounded-2xl border border-border bg-surface p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-lime/15 text-lime">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Leadify</p>
            <p className="text-xs text-muted-foreground">today, 8:00 AM IST</p>
          </div>
        </div>
        <div className="space-y-3 pt-4 font-mono text-[13px] leading-relaxed text-foreground/90">
          <p>👋 Your batch is ready — 15 leads.</p>
          <div className="rounded-lg bg-background/60 p-3">
            <p className="font-sans font-semibold">Ravi Sharma</p>
            <p className="font-sans text-xs text-muted-foreground">Founder, ProductHQ</p>
            <p className="mt-2 text-xs">🔗 linkedin.com/in/ravisharma</p>
            <p className="text-xs">📧 ravi@producthq.com</p>
            <p className="text-xs">📞 +91 98765 43210</p>
            <p className="mt-2 text-xs text-lime">⭐ Score 87/100 — SaaS founder, active buyer signals</p>
          </div>
          <p className="text-xs text-muted-foreground">+ 14 more →</p>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", icon: Target, title: "Define your ICP", body: "Industry, role, company size, geography. Takes 2 minutes — once." },
    { n: "02", icon: Sparkles, title: "We do the research", body: "Our agents scan LinkedIn, Twitter and 10+ sources to find real people who match." },
    { n: "03", icon: MessageCircle, title: "Leads in your inbox", body: "15 scored, enriched leads every morning at 8 AM IST. Just reach out. WhatsApp delivery coming soon." },
  ];
  return (
    <section className="border-t border-border/60 bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">How it works</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight md:text-4xl">
            From ICP to inbox in one morning.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="group relative rounded-2xl border border-border bg-background p-6 transition hover:border-lime/40">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <s.icon className="h-5 w-5 text-lime" />
              </div>
              <h3 className="mt-8 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const features = [
    "15 enriched leads delivered daily",
    "LinkedIn URL, email and phone number",
    "Lead scoring with ICP-fit reasoning",
    "Delivered to your inbox at 8 AM IST",
    "Deduped automatically — no repeats",
    "Cancel anytime",
  ];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">Pricing</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight md:text-4xl">
            Start with a 7-day free trial.
          </h2>
          <p className="mt-3 text-muted-foreground">No credit card. Full access. Cancel anytime.</p>
        </div>

        <div className="mx-auto mt-12 max-w-md">
          <div className="relative rounded-3xl border border-lime/30 bg-surface p-8 shadow-2xl shadow-lime/5">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight">₹499</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">7-day free trial · 15 leads every day</p>

            <ul className="mt-8 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime/15 text-lime">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-md bg-lime px-5 py-3 text-sm font-semibold text-lime-foreground transition hover:opacity-90"
            >
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 md:flex-row">
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Leadify</p>
        <p className="text-xs text-muted-foreground">Built for solopreneurs who'd rather build than prospect.</p>
      </div>
    </footer>
  );
}
