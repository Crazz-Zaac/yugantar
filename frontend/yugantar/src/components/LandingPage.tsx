import { ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import yugantarLogo from "@/assets/yugantar_logo.svg";

type Highlight = {
  icon: typeof TrendingUp;
  title: string;
  body: string;
};

const HIGHLIGHTS: Highlight[] = [
  {
    icon: TrendingUp,
    title: "Collective investing",
    body: "We pool member capital and deploy it into vetted opportunities, turning small, steady contributions into shared returns.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent by design",
    body: "Every deposit, loan, and payout is recorded and auditable. Members see exactly where the group's money is and how it grows.",
  },
  {
    icon: Users,
    title: "Owned by members",
    body: "No outside shareholders. The people who contribute are the people who decide and the people who benefit.",
  },
  {
    icon: Wallet,
    title: "Disciplined finance",
    body: "Structured savings, fair lending, and clear policies keep the fund healthy and the group's trust intact.",
  },
];

const STATS: { value: string; label: string }[] = [
  { value: "8", label: "Members / Investors" },
  { value: "$12.8M", label: "Total Deposits" },
  { value: "99.2%", label: "Repayment Rate" },
];

export function LandingPage() {
  const scrollToHighlights = () => {
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
            <img src={yugantarLogo} alt={t("Yugantar")} className="h-9 w-9" />
          </div>
          <span className="text-lg font-bold text-foreground">
            {t("Yugantar")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden px-6 py-16 md:px-10 md:py-24">
          <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
            <span className="mb-5 inline-flex items-center rounded-full border border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {t("A member-owned investment group")}
            </span>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
              {t("We invest together, and we grow together.")}
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {t(
                "Yugantar is a group of investors pooling savings into a transparent, member-governed fund — financing loans, backing opportunities, and sharing the returns among the people who built it."
              )}
            </p>
            <div className="mt-9">
              <Button size="lg" variant="outline" onClick={scrollToHighlights}>
                {t("How it works")}
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-14 grid w-full grid-cols-3 gap-6 border-t border-border pt-10">
              {STATS.map(s => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-primary md:text-3xl">
                    {s.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                    {t(s.label)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Background decoration */}
          <div className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-primary/5" />
          <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/5" />
        </section>

        {/* How it works / value props */}
        <section
          id="how-it-works"
          className="border-t border-border bg-muted/30 px-6 py-16 md:px-10 md:py-20"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {t("Why members invest through Yugantar")}
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                {t(
                  "One fund, run openly for the people who fund it. Here is what that means in practice."
                )}
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-border bg-card p-6 text-left shadow-sm"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-card-foreground">
                    {t(title)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(body)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 md:px-10">
        <p className="text-center text-xs text-muted-foreground">
          {t("© 2026 Yugantar Cooperative. All rights reserved.")}
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
