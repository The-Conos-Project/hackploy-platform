import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api, type DomainInfo, type UpdateStatus } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";
import { CopyButton } from "@/components/CopyButton";

export function AdminSettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState("domain");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [domainInfo, setDomainInfo] = useState<DomainInfo | null>(null);
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const tabs = useMemo(
    () => [
      { id: "domain", label: t("custom_domain") },
      { id: "version", label: t("version") },
    ],
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const [st, dom] = await Promise.all([api.updateStatus(), api.getDomain()]);
      setStatus(st);
      setDomainInfo(dom);
      setDomain(dom.domain || "");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "check failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onUpdate = async () => {
    setBusy(true);
    try {
      const res = await api.applyUpdate();
      toast.success(res.message || t("update_started"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "update failed");
    } finally {
      setBusy(false);
    }
  };

  const onSaveDomain = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.saveDomain(domain.trim());
      setDomainInfo(res);
      setDomain(res.domain);
      toast.success(t("domain_saved"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "domain failed");
    } finally {
      setBusy(false);
    }
  };

  const onIssueCert = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.issueCertificate(email.trim());
      toast.success(t("cert_issued"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "certificate failed");
    } finally {
      setBusy(false);
    }
  };

  const dnsHost = domainInfo?.domain || domain || "ctf.example.com";
  const publicIP = domainInfo?.public_ip || "…";
  const dnsBlock = `Type: A\nHost/Name: ${dnsHost}\nValue: ${publicIP}\nTTL: Auto`;

  return (
    <Shell role="admin">
      <h1>{t("nav_settings")}</h1>
      <p className="muted">{t("settings_body")}</p>

      <PageTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "domain" ? (
        <section className="card tab-panel">
          <h2 style={{ marginTop: 0 }}>{t("custom_domain")}</h2>
          <p className="muted">{t("domain_body")}</p>
          <form onSubmit={(e) => void onSaveDomain(e)} className="domain-form">
            <label className="small-text">{t("domain")}</label>
            <div className="inline-field">
              <input
                className="font-mono"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ctf.example.com"
                required
              />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("save_domain")}
              </button>
            </div>
          </form>

          <div className="domain-block">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{t("dns_record")}</h3>
              <CopyButton value={dnsBlock} />
            </div>
            <p className="small-text">{t("dns_body")}</p>
            <div className="dns-rows">
              {(
                [
                  ["Type", "A"],
                  ["Host", dnsHost],
                  ["Value", publicIP],
                  ["TTL", "Auto"],
                ] as const
              ).map(([label, value]) => (
                <div className="dns-row" key={label}>
                  <span>{label}</span>
                  <ChevronRight size={14} className="dns-chevron" aria-hidden />
                  <code className="font-mono">{value}</code>
                  <CopyButton value={value} />
                </div>
              ))}
            </div>
          </div>

          <div className="domain-block">
            <h3 style={{ marginTop: 0 }}>{t("issue_cert")}</h3>
            <form onSubmit={(e) => void onIssueCert(e)}>
              <label className="small-text">{t("cert_email")}</label>
              <div className="inline-field">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
                <button type="submit" className="btn-compact" disabled={busy || !domainInfo?.domain}>
                  {t("issue_cert")}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {tab === "version" ? (
        <section className="card tab-panel" id="version">
          <h2 style={{ marginTop: 0 }}>{t("version")}</h2>
          <p className="muted">{t("update_settings_body")}</p>
          {!status ? (
            <p className="small-text">{t("update_checking")}</p>
          ) : (
            <>
              <div className="grid">
                <div>
                  <div className="small-text">{t("current_version")}</div>
                  <div className="font-mono" style={{ marginTop: 6, fontSize: "1.25rem" }}>
                    {status.current}
                  </div>
                </div>
                <div>
                  <div className="small-text">{t("remote_tag")}</div>
                  <div className="font-mono" style={{ marginTop: 6 }}>
                    {status.image}
                  </div>
                </div>
              </div>

              {status.update_available ? (
                <p className="small-text" style={{ marginTop: 16 }}>
                  {t("update_available")}
                </p>
              ) : (
                <p className="small-text" style={{ marginTop: 16 }}>
                  {status.error ? status.error : t("update_up_to_date")}
                </p>
              )}

              <div className="row" style={{ marginTop: 16 }}>
                <button type="button" className="secondary btn-compact" disabled={busy} onClick={() => void refresh()}>
                  {busy ? t("loading") : t("update_checking")}
                </button>
                <button
                  type="button"
                  className="btn-compact"
                  disabled={busy || !status.update_available}
                  onClick={() => void onUpdate()}
                >
                  {t("update_now")}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </Shell>
  );
}
