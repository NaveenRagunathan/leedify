import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, X, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Define your ICP — Leadify" },
      { name: "description", content: "Tell Leadify who your ideal customer is." },
    ],
  }),
  component: Onboarding,
});

const INDUSTRIES = [
  "SaaS", "E-commerce", "Fintech", "Healthtech", "Edtech",
  "Marketing & Agencies", "Consulting", "Real Estate", "Manufacturing", "Media & Content", "Other",
];
const COMPANY_SIZES = ["Solo", "2–10", "11–50", "51–200"];

function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const [industry, setIndustry] = useState("SaaS");
  const [industryOther, setIndustryOther] = useState("");
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [jobTitleDraft, setJobTitleDraft] = useState("");
  const [companySize, setCompanySize] = useState<string[]>(["Solo", "2–10"]);
  const [geography, setGeography] = useState<string[]>([]);
  const [geoDraft, setGeoDraft] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwDraft, setKwDraft] = useState("");
  const [productDesc, setProductDesc] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_icp").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        const custom = data.industry && !INDUSTRIES.includes(data.industry);
        setIndustry(custom ? "Other" : (data.industry ?? "SaaS"));
        if (custom) setIndustryOther(data.industry ?? "");
        setJobTitles(data.job_titles ?? []);
        setCompanySize(data.company_size?.length ? data.company_size : ["Solo", "2–10"]);
        setGeography(data.geography ?? []);
        setKeywords(data.keywords ?? []);
        setProductDesc(data.product_desc ?? "");
      }
      setHydrating(false);
    })();
  }, []);

  function toggleSize(s: string) {
    setCompanySize((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));
  }

  function addTag(value: string, list: string[], setList: (v: string[]) => void, setDraft: (v: string) => void) {
    const v = value.trim();
    if (!v || list.includes(v)) return;
    setList([...list, v]);
    setDraft("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jobTitles.length === 0) return toast.error("Add at least one job title.");
    if (keywords.length === 0) return toast.error("Add at least one keyword.");
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const finalIndustry = industry === "Other" ? industryOther.trim() : industry;
      const { error } = await supabase.from("user_icp").upsert({
        user_id: user.id,
        industry: finalIndustry || null,
        job_titles: jobTitles,
        company_size: companySize,
        geography,
        keywords,
        product_desc: productDesc || null,
      }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("ICP saved.");
      navigate({ to: "/onboarding/done" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (hydrating) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-lime text-lime-foreground font-bold">L</span>
            <span className="text-base font-semibold tracking-tight">Leadify</span>
          </div>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">Step 1 of 2</p>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight md:text-4xl">
            Tell us who your ideal customer is.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Spend 2 minutes here. We use this to research 15 leads every morning.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 rounded-2xl border border-border bg-surface p-8">
          <Section title="Target industry">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="input">
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            {industry === "Other" && (
              <input className="input mt-2" placeholder="Type your industry"
                value={industryOther} onChange={(e) => setIndustryOther(e.target.value)} maxLength={60}
              />
            )}
          </Section>

          <Section title="Target job titles" hint="Add one or more. Press Enter to add.">
            <TagsInput
              value={jobTitles} setValue={setJobTitles}
              draft={jobTitleDraft} setDraft={setJobTitleDraft}
              onAdd={() => addTag(jobTitleDraft, jobTitles, setJobTitles, setJobTitleDraft)}
              placeholder="Founder, Head of Growth, CTO…"
            />
          </Section>

          <Section title="Company size">
            <div className="flex flex-wrap gap-2">
              {COMPANY_SIZES.map((s) => {
                const active = companySize.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleSize(s)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      active ? "border-lime bg-lime/10 text-lime"
                             : "border-border bg-background text-foreground/80 hover:border-lime/40"
                    }`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Geography" hint="Countries or regions you sell to.">
            <TagsInput
              value={geography} setValue={setGeography}
              draft={geoDraft} setDraft={setGeoDraft}
              onAdd={() => addTag(geoDraft, geography, setGeography, setGeoDraft)}
              placeholder="India, United States, EU…"
            />
          </Section>

          <Section title="Keywords describing your ideal customer" hint="Specific signals that help us find them.">
            <TagsInput
              value={keywords} setValue={setKeywords}
              draft={kwDraft} setDraft={setKwDraft}
              onAdd={() => addTag(kwDraft, keywords, setKeywords, setKwDraft)}
              placeholder="indie hacker, bootstrapped, ships fast…"
            />
          </Section>

          <Section title="Describe your product in one line" hint="Optional, but improves lead scoring.">
            <textarea value={productDesc} onChange={(e) => setProductDesc(e.target.value)}
              className="input min-h-[88px] resize-none"
              placeholder="We help solopreneurs get 15 qualified leads on WhatsApp every morning."
              maxLength={240}
            />
          </Section>

          <button type="submit" disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-lime px-4 py-3 text-sm font-semibold text-lime-foreground transition hover:opacity-90 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save ICP & continue
          </button>
        </form>
      </main>

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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function TagsInput({
  value, setValue, draft, setDraft, onAdd, placeholder,
}: {
  value: string[]; setValue: (v: string[]) => void;
  draft: string; setDraft: (v: string) => void;
  onAdd: () => void; placeholder?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2 focus-within:border-lime focus-within:ring-2 focus-within:ring-lime/20">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded bg-lime/10 px-2 py-1 text-xs font-medium text-lime">
            {tag}
            <button type="button" onClick={() => setValue(value.filter((t) => t !== tag))} className="opacity-70 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); onAdd(); }
            else if (e.key === "Backspace" && !draft && value.length) setValue(value.slice(0, -1));
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          maxLength={60}
        />
        {draft && (
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-lime hover:bg-lime/10">
            <Plus className="h-3 w-3" /> add
          </button>
        )}
      </div>
    </div>
  );
}
