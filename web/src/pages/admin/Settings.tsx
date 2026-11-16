import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type DomainInfo, type UpdateStatus } from "@/lib/api";
import { getDomain, getUpdateStatus } from "@/lib/platform";
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
      const [st, dom] = await Promise.all([getUpdateStatus(), getDomain()]);
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

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  const shortDigest = (d?: string) => (d ? d.replace(/^sha256:/, "").slice(0, 12) : "—");

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_settings")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("settings_body")}
          </p>
        </div>
      </div>

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
            <button
              type="button"
              className="dns-sheet"
              onClick={() => void copyText(dnsBlock)}
              title={t("copy")}
            >
              <div className="dns-sheet-line">
                <span>Type</span>
                <code>A</code>
              </div>
              <div className="dns-sheet-line">
                <span>Host</span>
                <code
                  className="dns-click"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyText(dnsHost);
                  }}
                >
                  {dnsHost}
                </code>
              </div>
              <div className="dns-sheet-line">
                <span>Value</span>
                <code
                  className="dns-click"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyText(publicIP);
                  }}
                >
                  {publicIP}
                </code>
              </div>
              <div className="dns-sheet-line">
                <span>TTL</span>
                <code>Auto</code>
              </div>
            </button>
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
              <div className="version-grid">
                <div className="version-card">
                  <div className="small-text">{t("current_version")}</div>
                  <div className="version-card-value font-mono">{status.current}</div>
                  <div className="small-text" style={{ marginTop: 8 }}>
                    {status.update_available ? t("update_available") : t("update_up_to_date")}
                  </div>
                </div>
                <div className="version-card">
                  <div className="small-text">{t("remote_tag")}</div>
                  <div className="version-card-value font-mono" style={{ fontSize: "1rem" }}>
                    {status.image}
                  </div>
                  <div className="small-text font-mono" style={{ marginTop: 8 }}>
                    {status.tag}
                  </div>
                </div>
                <div className="version-card">
                  <div className="small-text">{t("image_digest")}</div>
                  <div className="version-card-value font-mono" style={{ fontSize: "1rem" }}>
                    {shortDigest(status.local_digest || status.remote_digest)}
                  </div>
                  <div className="small-text" style={{ marginTop: 8 }}>
                    {status.checked_at
                      ? new Date(status.checked_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
              </div>

              {status.error ? (
                <p className="small-text" style={{ marginTop: 16, color: "#fca5a5" }}>
                  {status.error}
                </p>
              ) : null}

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
