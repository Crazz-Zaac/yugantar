import { useState } from "react";
import { Loader2, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import type { UserForUI } from "@/utils/normalizeUser";
import { mfaChallenge } from "@/api/api";

function errorMessage(err: any): string {
  return (
    err?.response?.data?.detail ||
    err?.message ||
    t("Something went wrong. Please try again.")
  );
}

/** Login step for a user who already has 2FA: enter the one-time code. */
export function MfaStep({
  mfaToken,
  onComplete,
  onBack,
}: {
  mfaToken: string;
  onComplete: (user: UserForUI) => void;
  onBack: () => void;
}) {
  const { finishLogin } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { access_token } = await mfaChallenge(mfaToken, code.trim());
      const user = await finishLogin(access_token);
      onComplete(user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("Two-factor authentication")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Enter the 6-digit code from your authenticator app to continue.")}
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="mfa-code"
            className="text-sm font-medium text-foreground"
          >
            {t("Authentication code")}
          </Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            value={code}
            onChange={e => setCode(e.target.value.trim())}
            className="h-11 bg-background text-center text-lg tracking-[0.3em]"
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            {t("Lost your device? Enter one of your recovery codes instead.")}
          </p>
        </div>

        <Button
          type="submit"
          className="h-11 gap-2 font-medium"
          disabled={busy || code.length < 6}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Verifying...")}
            </>
          ) : (
            <>
              {t("Verify")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="inline-flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("Back to sign in")}
      </button>
    </div>
  );
}
