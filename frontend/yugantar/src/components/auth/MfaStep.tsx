import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Copy,
  Download,
  Check,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import type { UserForUI } from "@/utils/normalizeUser";
import { mfaChallenge, mfaConfirmSetup, mfaSetup } from "@/api/api";

type Mode = "setup" | "challenge";

function errorMessage(err: any): string {
  return (
    err?.response?.data?.detail ||
    err?.message ||
    t("Something went wrong. Please try again.")
  );
}

/** Inner content for the sign-in panel while the second factor is pending. */
export function MfaStep({
  mode,
  mfaToken,
  onComplete,
  onBack,
}: {
  mode: Mode;
  mfaToken: string;
  onComplete: (user: UserForUI) => void;
  onBack: () => void;
}) {
  const { finishLogin } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Enrolment (setup) state
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // On entering setup mode, ask the server for a fresh secret + QR.
  useEffect(() => {
    if (mode !== "setup") return;
    let cancelled = false;
    setBusy(true);
    mfaSetup(mfaToken)
      .then(data => {
        if (cancelled) return;
        setSecret(data.secret);
        setOtpauthUri(data.otpauth_uri);
      })
      .catch(err => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [mode, mfaToken]);

  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 6);

  const submitChallenge = async (e: React.FormEvent) => {
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

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await mfaConfirmSetup(mfaToken, code.trim());
      // Show the recovery codes before completing sign-in.
      setRecoveryCodes(res.recovery_codes);
      setPendingToken(res.access_token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finishAfterRecovery = async () => {
    if (!pendingToken) return;
    setBusy(true);
    try {
      const user = await finishLogin(pendingToken);
      onComplete(user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // ─── Recovery codes screen (shown once, after enrolment) ──────────────────
  if (recoveryCodes) {
    return (
      <RecoveryCodes
        codes={recoveryCodes}
        busy={busy}
        onContinue={finishAfterRecovery}
      />
    );
  }

  const isSetup = mode === "setup";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {isSetup
            ? t("Set up two-factor authentication")
            : t("Two-factor authentication")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSetup
            ? t(
                "Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to finish."
              )
            : t(
                "Enter the 6-digit code from your authenticator app to continue."
              )}
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

      {isSetup && (
        <div className="flex flex-col items-center gap-3">
          {otpauthUri ? (
            <div className="rounded-xl border bg-white p-4">
              <QRCodeSVG value={otpauthUri} size={168} />
            </div>
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {secret && (
            <div className="w-full text-center">
              <p className="text-xs text-muted-foreground">
                {t("Or enter this key manually:")}
              </p>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs font-mono">
                {secret}
              </code>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={isSetup ? submitConfirm : submitChallenge}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="mfa-code"
            className="text-sm font-medium text-foreground"
          >
            {isSetup ? t("6-digit code") : t("Authentication code")}
          </Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            value={code}
            onChange={e =>
              setCode(
                mode === "challenge"
                  ? e.target.value.trim()
                  : digitsOnly(e.target.value)
              )
            }
            className="h-11 bg-background text-center text-lg tracking-[0.3em]"
            disabled={busy}
          />
          {mode === "challenge" && (
            <p className="text-xs text-muted-foreground">
              {t("Lost your device? Enter one of your recovery codes instead.")}
            </p>
          )}
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
              {isSetup ? t("Verify and continue") : t("Verify")}
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

function RecoveryCodes({
  codes,
  busy,
  onContinue,
}: {
  codes: string[];
  busy: boolean;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; the download still works */
    }
  };

  const download = () => {
    const blob = new Blob([text + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yugantar-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setAcknowledged(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("Save your recovery codes")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Each code can be used once to sign in if you lose your authenticator. Store them somewhere safe — they won't be shown again."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4">
        {codes.map(c => (
          <code key={c} className="text-center font-mono text-sm">
            {c}
          </code>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={copy}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? t("Copied") : t("Copy")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={download}
        >
          <Download className="h-4 w-4" />
          {t("Download")}
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        {t("I have saved my recovery codes.")}
      </label>

      <Button
        type="button"
        className="h-11 gap-2 font-medium"
        disabled={busy || !acknowledged}
        onClick={onContinue}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Finishing...")}
          </>
        ) : (
          <>
            {t("Continue to Yugantar")}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
