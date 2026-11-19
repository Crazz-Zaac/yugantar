import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/api";
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
import { Skeleton } from "@/components/ui/skeleton";

/*
 * The cooperative's official details. The Admin edits them here; outgoing
 * emails use the name and contact email in their signature block.
 */

interface Organization {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

const FIELDS: {
  key: keyof Organization;
  label: string;
  type?: string;
  placeholder?: string;
}[] = [
  {
    key: "name",
    label: "Organisation name",
    placeholder: "Yugantar Cooperative",
  },
  {
    key: "email",
    label: "Contact email",
    type: "email",
    placeholder: "yugantar.coop@gmail.com",
  },
  { key: "phone", label: "Phone", placeholder: "+977-1-0000000" },
  { key: "address", label: "Address", placeholder: "Kathmandu, Nepal" },
  { key: "website", label: "Website", placeholder: "https://…" },
];

export function OrganizationTab() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/organization")
      .then(r => !cancelled && setOrg(r.data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key: keyof Organization, value: string) =>
    setOrg(o => (o ? { ...o, [key]: value } : o));

  const save = async () => {
    if (!org) return;
    if (!org.name.trim()) {
      toast.error(t("The organisation name can't be empty."));
      return;
    }
    setSaving(true);
    try {
      const r = await apiClient.put("/organization", org);
      setOrg(r.data);
      toast.success(t("Organisation details saved"));
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : t("Couldn't save the details.")
      );
    } finally {
      setSaving(false);
    }
  };

  if (error && !org)
    return (
      <p className="text-sm text-destructive">
        {t("Couldn't load the organisation details.")}
      </p>
    );
  if (!org) return <Skeleton className="h-72 w-full max-w-2xl" />;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" />
          {t("Organisation details")}
        </CardTitle>
        <CardDescription>
          {t(
            "The cooperative's official details. Emails use the name and contact email in their signature."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {FIELDS.map(({ key, label, type, placeholder }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`org-${key}`}>{t(label)}</Label>
            <Input
              id={`org-${key}`}
              type={type ?? "text"}
              value={org[key]}
              placeholder={placeholder}
              onChange={e => set(key, e.target.value)}
              disabled={saving}
            />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("Save changes")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
