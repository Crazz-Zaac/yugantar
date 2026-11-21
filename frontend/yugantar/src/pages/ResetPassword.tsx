import { getLang, t } from "@/lib/i18n";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENV } from "@/config/env";
import yugantarLogo from "@/assets/yugantar_logo.svg";

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${ENV.API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Language": getLang() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || t("Something went wrong. Please try again."));
  return data;
}

export default function ResetPassword() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(search).get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const requestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await postJson("/users/me/reset-password", { email: email.trim() });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("Passwords do not match."));
      return;
    }
    setBusy(true);
    try {
      await postJson("/users/reset-password/confirm", {
        token,
        new_password: password,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="flex flex-col gap-6 px-6 pb-8 pt-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm">
              <img src={yugantarLogo} alt={t("Yugantar")} className="h-10 w-10" />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {done ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
                <CheckCircle2 className="h-9 w-9 text-success" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {token ? t("Password updated") : t("Check your email")}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {token
                    ? t("Your password has been changed. You can sign in now.")
                    : t("If an account exists for that email, we've sent a reset link. It's valid for 30 minutes.")}
                </p>
              </div>
              <Button className="mt-1 gap-2" onClick={() => navigate("/login")}>
                {t("Go to Sign In")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : token ? (
            <form onSubmit={setNewPassword} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1 text-center">
                <KeyRound className="mx-auto h-6 w-6 text-primary" />
                <h1 className="text-xl font-semibold text-foreground">
                  {t("Set a new password")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("Choose a new password for your account.")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-pw">{t("New password")}</Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPw ? t("Hide password") : t("Show password")}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-pw">{t("Confirm new password")}</Label>
                <Input
                  id="confirm-pw"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="h-11 gap-2" disabled={busy || password.length < 8}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Update password")}
              </Button>
            </form>
          ) : (
            <form onSubmit={requestLink} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1 text-center">
                <Mail className="mx-auto h-6 w-6 text-primary" />
                <h1 className="text-xl font-semibold text-foreground">
                  {t("Forgot your password?")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("Enter your email and we'll send you a reset link.")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-email">{t("Email address")}</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t("you@cooperative.org")}
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" className="h-11 gap-2" disabled={busy || !email}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Send reset link")}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("Back to sign in")}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
