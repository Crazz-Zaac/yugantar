import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, KeyRound, RotateCcw } from "lucide-react";
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

export function MfaSettingsCard() {
  const { logout } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState("");

  // Regenerate recovery codes
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
      // The server revoked every session; sign out and send the user back to
      // sign-in, where they'll enrol a new authenticator.
      await logout();
    } catch (err) {
      setError(errText(err));
      setResetBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("Two-factor authentication")}
        </CardTitle>
        <CardDescription>
          {t("An authenticator app protects your account at every sign-in.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {t("Recovery codes remaining")}
          </span>
          <span className="font-semibold">
            {status ? (
              status.recovery_codes_remaining
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </span>
        </div>

        {/* Regenerate recovery codes */}
        {newCodes ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t(
                "New recovery codes — save them now; the old ones no longer work."
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3">
              {newCodes.map(c => (
                <code key={c} className="text-center font-mono text-sm">
                  {c}
                </code>
              ))}
            </div>
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
                onChange={e =>
                  setRegenCode(
                    e.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                  )
                }
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

        {/* Reset authenticator (lost device) */}
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
                  "This removes your current authenticator and signs you out everywhere. You'll set up a new one at your next sign-in."
                )}
              </p>
              <Input
                type="password"
                placeholder={t("Account password")}
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
              />
              <Input
                inputMode="numeric"
                placeholder={t("Current 6-digit code")}
                value={resetCode}
                onChange={e =>
                  setResetCode(
                    e.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                  )
                }
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
                  disabled={resetBusy || !resetPassword || resetCode.length < 6}
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
      </CardContent>
    </Card>
  );
}
