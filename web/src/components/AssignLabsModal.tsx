import { useMemo, useState } from "react";
import { ChevronDown, Package, Search } from "lucide-react";
import type { Challenge } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Checkbox } from "./Checkbox";

function packageName(tag: string): string {
  return tag.replace(/^hackploy-/, "") || tag || "unknown";
}

export function AssignLabsModal({
  challenges,
  selected,
  onChange,
  onClose,
  onSave,
  busy,
  title,
}: {
  challenges: Challenge[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  onSave: () => void;
  busy?: boolean;
  title: string;
}) {
  const { t } = useI18n();
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pkgFilter, setPkgFilter] = useState<string>("all");
  const [openPkgs, setOpenPkgs] = useState<Record<string, boolean>>({});

  const packages = useMemo(() => {
    const map = new Map<string, Challenge[]>();
    for (const ch of challenges) {
      const key = packageName(ch.image_tag);
      const list = map.get(key) ?? [];
      list.push(ch);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [challenges]);

  const filteredPackages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return packages
      .filter(([name]) => pkgFilter === "all" || name === pkgFilter)
      .map(([name, labs]) => {
        const labsFiltered = !q
          ? labs
          : labs.filter(
              (ch) =>
                (ch.display_name || ch.name).toLowerCase().includes(q) ||
                ch.name.toLowerCase().includes(q) ||
                name.toLowerCase().includes(q),
            );
        return [name, labsFiltered] as const;
      })
      .filter(([, labs]) => labs.length > 0);
  }, [packages, pkgFilter, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleOne = (id: string, on: boolean) => {
    if (on) onChange([...selected, id]);
    else onChange(selected.filter((x) => x !== id));
  };

  const togglePackage = (labs: Challenge[], on: boolean) => {
    const ids = labs.map((l) => l.id);
    if (on) {
      const next = new Set(selected);
      for (const id of ids) next.add(id);
      onChange([...next]);
    } else {
      const drop = new Set(ids);
      onChange(selected.filter((id) => !drop.has(id)));
    }
  };

  const pkgState = (labs: Challenge[]) => {
    const n = labs.filter((l) => selectedSet.has(l.id)).length;
    if (n === 0) return { checked: false, indeterminate: false };
    if (n === labs.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  return (
    <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content assign-modal">
        <div className="row" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="assign-layout">
          <aside className="assign-side">
            <div className="small-text" style={{ marginBottom: 8 }}>
              {t("packages")}
            </div>
            <button
              type="button"
              className={`assign-pkg-filter${pkgFilter === "all" ? " active" : ""}`}
              onClick={() => setPkgFilter("all")}
            >
              {t("all_packages")}
            </button>
            {packages.map(([name, labs]) => (
              <button
                key={name}
                type="button"
                className={`assign-pkg-filter${pkgFilter === name ? " active" : ""}`}
                onClick={() => setPkgFilter(name)}
              >
                <Package size={14} />
                <span>{name}</span>
                <span className="assign-pkg-count">{labs.length}</span>
              </button>
            ))}
          </aside>

          <div className="assign-main">
            <div className="assign-search">
              <input
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                placeholder={t("search_labs")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(queryDraft);
                }}
              />
              <button type="button" className="btn-compact secondary" onClick={() => setQuery(queryDraft)}>
                <Search size={14} /> {t("search")}
              </button>
            </div>

            <div className="assign-packages">
              {filteredPackages.length === 0 ? (
                <p className="small-text">{t("no_challenges")}</p>
              ) : null}
              {filteredPackages.map(([name, labs]) => {
                const open = openPkgs[name] ?? true;
                const st = pkgState(labs);
                return (
                  <div key={name} className="assign-pkg">
                    <div className="assign-pkg-head">
                      <Checkbox
                        checked={st.checked}
                        indeterminate={st.indeterminate}
                        onChange={(on) => togglePackage(labs, on)}
                      />
                      <button
                        type="button"
                        className="assign-pkg-toggle"
                        onClick={() => setOpenPkgs((p) => ({ ...p, [name]: !open }))}
                      >
                        <Package size={15} />
                        <strong>{name}</strong>
                        <span className="small-text">{labs.length}</span>
                        <ChevronDown size={16} className={open ? "chev open" : "chev"} />
                      </button>
                    </div>
                    {open ? (
                      <ul className="assign-lab-list">
                        {labs.map((ch) => {
                          const on = selectedSet.has(ch.id);
                          return (
                            <li key={ch.id}>
                              <Checkbox
                                checked={on}
                                onChange={(next) => toggleOne(ch.id, next)}
                                label={ch.display_name || ch.name}
                              />
                              <span className={`status-badge status-${ch.build_status === "ready" ? "success" : ch.build_status === "failed" ? "failed" : "building"}`}>
                                {ch.build_status}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <span className="small-text">
            {selected.length} {t("selected")}
          </span>
          <button type="button" className="btn-compact" disabled={busy} onClick={onSave}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
