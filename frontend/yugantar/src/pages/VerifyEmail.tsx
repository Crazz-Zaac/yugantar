import { getLang, t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Clock,
  Mail,
  ShieldCheck,
  LogIn,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ENV } from "@/config/env";
import yugantarLogo from "@/assets/yugantar_logo.svg";

// pending = email verified but the account still needs an administrator's approval
type VerifyState = "loading" | "pending" | "ready" | "error";

type Step = {
  icon: typeof Mail;
  label: string;
  status: "done" | "current" | "upcoming";
};

/** The three steps from a verified email to signing in. */
function Steps({ steps }: { steps: Step[] }) {
  return (
    <div className="flex w-full items-start justify-between gap-1">
      {steps.map((s, i) => {
        const Icon = s.status === "done" ? CheckCircle2 : s.icon;
        return (
          <div
            key={s.label}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1 rounded",
                  i === 0
                    ? "bg-transparent"
                    : steps[i - 1].status === "done"
                      ? "bg-success"
                      : "bg-border"
                )}
              />
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  s.status === "done" &&
                    "border-success bg-success/10 text-success",
                  s.status === "current" &&
                    "border-warning bg-warning/10 text-warning",
                  s.status === "upcoming" &&
                    "border-border bg-muted text-muted-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    s.status === "current" &&
                      s.icon === Clock &&
                      "animate-pulse"
                  )}
                />
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1 rounded",
                  i === steps.length - 1
                    ? "bg-transparent"
                    : s.status === "done"
                      ? "bg-success"
                      : "bg-border"
                )}
              />
            </div>
            <span
              className={cn(
                "text-center text-[11px] leading-tight",
                s.status === "upcoming"
                  ? "text-muted-foreground"
                  : "font-medium text-foreground"
              )}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function VerifyEmail() {
  const search = useSearch();
  const [, navigate] = useLocation();

  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");

    if (!token) {
      setState("error");
      setErrorMessage(
        t("No verification token provided. Please check your email link.")
      );
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(
          `${ENV.API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "X-Language": getLang() },
          }
        );
        const data = await res.json();
        if (res.ok) {
          setState(data.approved ? "ready" : "pending");
        } else {
          setState("error");
          setErrorMessage(data.detail || t("Email verification failed."));
        }
      } catch {
        setState("error");
        setErrorMessage(
          t("Could not connect to the server. Please try again later.")
        );
      }
    };

    verify();
  }, [search]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="flex flex-col items-center gap-6 px-6 pb-8 pt-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm">
            <img src={yugantarLogo} alt={t("Yugantar")} className="h-10 w-10" />
          </div>

          {state === "loading" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {t("Verifying your email…")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Please wait while we verify your email address.")}
                </p>
              </div>
            </div>
          )}

          {state === "pending" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
                <CheckCircle2 className="h-9 w-9 text-success" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {t("Email verified")}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(
                    "Your email address is confirmed. Your account is now waiting for an administrator to approve it — we'll email you as soon as it's approved, and then you can sign in."
                  )}
                </p>
              </div>
              <div className="w-full rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                  <Clock className="h-4 w-4 shrink-0 text-warning" />
                  {t("Awaiting administrator approval")}
                </p>
              </div>
              <Steps
                steps={[
                  { icon: Mail, label: t("Email verified"), status: "done" },
                  {
                    icon: Clock,
                    label: t("Admin approval"),
                    status: "current",
                  },
                  { icon: LogIn, label: t("Sign in"), status: "upcoming" },
                ]}
              />
              <Button
                variant="outline"
                className="mt-1 gap-2"
                onClick={() => navigate("/login")}
              >
                {t("Back to sign in")}
              </Button>
            </>
          )}

          {state === "ready" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
                <ShieldCheck className="h-9 w-9 text-success" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {t("You're all set")}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(
                    "Your email is verified and your account is approved. You can sign in now."
                  )}
                </p>
              </div>
              <Steps
                steps={[
                  { icon: Mail, label: t("Email verified"), status: "done" },
                  { icon: ShieldCheck, label: t("Approved"), status: "done" },
                  { icon: LogIn, label: t("Sign in"), status: "current" },
                ]}
              />
              <Button className="mt-1 gap-2" onClick={() => navigate("/login")}>
                {t("Go to Sign In")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
                <XCircle className="h-9 w-9 text-destructive" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {t("Verification Failed")}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {errorMessage}
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-1 gap-2"
                onClick={() => navigate("/login")}
              >
                {t("Back to sign in")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
