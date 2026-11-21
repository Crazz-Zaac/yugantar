import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import { t } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  mfaStatus,
  mfaSetup,
  mfaConfirmSetup,
  mfaRegenerateRecoveryCodes,
  mfaReset,
  type MfaStatus,
} from "@/api/api";

function errText(err: any): string {
  return (
    err?.response?.data?.detail ||
    err?.message ||
    t("Something went wrong. Please try again.")
  );
}

function digits(v: string) {
  return v.replace(/[^0-9]/g, "").slice(0, 6);
}

function RecoveryCodeGrid({ codes }: { codes: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3">
      {codes.map(c => (
        <code key={c} className="text-center font-mono text-sm">
          {c}
        </code>
      ))}
    </div>
  );
}

export function MfaSettingsCard() {
  const { logout } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState("");

  // Enrolment (when 2FA is off)
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauth_uri: string;
  } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [enableBusy, setEnableBusy] = useState(false);
  const [enableCodes, setEnableCodes] = useState<string[] | null>(null);

  // Regenerate recovery codes (when 2FA is on)
  const [regenCode, setRegenCode] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  // Reset authenticator
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    mfaStatus()
      .then(setStatus)
      .catch(err => setError(errText(err)));
  }, []);

  // ── Enable 2FA ────────────────────────────────────────────────────────────
  const startEnable = async () => {
    setError("");
    setEnableBusy(true);
    try {
      setSetupData(await mfaSetup());
    } catch (err) {
      setError(errText(err));
    } finally {
      setEnableBusy(false);
    }
  };

  const confirmEnable = async () => {
    setError("");
    setEnableBusy(true);
    try {
      const res = await mfaConfirmSetup(enableCode.trim());
      setEnableCodes(res.recovery_codes);
    } catch (err) {
      setError(errText(err));
    } finally {
      setEnableBusy(false);
    }
  };

  const finishEnable = async () => {
    setSetupData(null);
    setEnableCode("");
    setEnableCodes(null);
    try {
      setStatus(await mfaStatus());
    } catch {
      setStatus(s => (s ? { ...s, enabled: true } : s));
    }
  };

  // ── Manage (when enabled) ──────────────────────────────────────────────────
  const regenerate = async () => {
    setError("");
    setRegenBusy(true);
    try {
      const res = await mfaRegenerateRecoveryCodes(regenCode.trim());
      setNewCodes(res.recovery_codes);
      setRegenCode("");
      setStatus(s =>
        s ? { ...s, recovery_codes_remaining: res.recovery_codes.length } : s
      );
    } catch (err) {
      setError(errText(err));
    } finally {
      setRegenBusy(false);
    }
  };

  const reset = async () => {
    setError("");
    setResetBusy(true);
    try {
      await mfaReset(resetPassword, resetCode.trim());
      // The server revoked every session; sign out. 2FA is now off; it can be
      // turned on again from Settings after signing back in.
      await logout();
    } catch (err) {
      setError(errText(err));
      setResetBusy(false);
    }
  };

  const enabled = status?.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("Two-factor authentication")}
        </CardTitle>
        <CardDescription>
          {t("Add an authenticator app for a one-time code at every sign-in.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!status ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !enabled ? (
          // ── 2FA is OFF: enrolment ──────────────────────────────────────────
          enableCodes ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-success">
                {t("Two-factor authentication is on.")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Save these recovery codes — each can be used once if you lose your authenticator. They won't be shown again."
                )}
              </p>
              <RecoveryCodeGrid codes={enableCodes} />
              <Button className="self-end gap-2" onClick={finishEnable}>
                {t("Done")}
              </Button>
            </div>
          ) : setupData ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to finish."
                )}
              </p>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border bg-white p-4">
                  <QRCodeSVG value={setupData.otpauth_uri} size={160} />
                </div>
                <div className="w-full text-center">
                  <p className="text-xs text-muted-foreground">
                    {t("Or enter this key manually:")}
                  </p>
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs font-mono">
                    {setupData.secret}
                  </code>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  autoFocus
                  placeholder={t("6-digit code")}
                  value={enableCode}
                  onChange={e => setEnableCode(digits(e.target.value))}
                  className="text-center tracking-[0.3em]"
                />
                <Button
                  onClick={confirmEnable}
                  disabled={enableBusy || enableCode.length < 6}
                  className="gap-2"
                >
                  {enableBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {t("Verify")}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
              <button
                type="button"
                className="self-start text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSetupData(null);
                  setEnableCode("");
                  setError("");
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                {t("Two-factor authentication is off.")}
              </span>
              <Button size="sm" onClick={startEnable} disabled={enableBusy}>
                {enableBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("Enable")
                )}
              </Button>
            </div>
          )
        ) : (
          // ── 2FA is ON: manage ──────────────────────────────────────────────
          <>
            <div className="flex items-center justify-between rounded-lg border bg-success/5 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-success">
                <ShieldCheck className="h-4 w-4" />
                {t("Two-factor authentication is on.")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("Recovery codes left: {0}", status.recovery_codes_remaining)}
              </span>
            </div>

            {newCodes ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "New recovery codes — save them now; the old ones no longer work."
                  )}
                </p>
                <RecoveryCodeGrid codes={newCodes} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="regen-code"
                  className="flex items-center gap-1.5 text-xs font-medium"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {t("Regenerate recovery codes")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="regen-code"
                    inputMode="numeric"
                    placeholder={t("Current 6-digit code")}
                    value={regenCode}
                    onChange={e => setRegenCode(digits(e.target.value))}
                  />
                  <Button
                    variant="outline"
                    onClick={regenerate}
                    disabled={regenBusy || regenCode.length < 6}
                  >
                    {regenBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("Regenerate")
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              {!showReset ? (
                <Button
                  variant="ghost"
                  className="h-auto gap-1.5 p-0 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setShowReset(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("Lost your device? Reset your authenticator")}
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "This turns off two-factor authentication and signs you out everywhere. You can set it up again from Settings."
                    )}
                  </p>
                  <Input
                    type="password"
                    placeholder={t("Account password")}
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                  />
                  <Input
                    placeholder={t("Authenticator code or recovery code")}
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value.trim())}
                  />
                  <div className="flex gap-2 self-end">
                    <Button
                      variant="ghost"
                      onClick={() => setShowReset(false)}
                      disabled={resetBusy}
                    >
                      {t("Cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={reset}
                      disabled={
                        resetBusy || !resetPassword || resetCode.length < 6
                      }
                    >
                      {resetBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("Reset authenticator")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
