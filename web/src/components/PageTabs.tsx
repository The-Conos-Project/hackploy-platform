type Tab = { id: string; label: string };

export function PageTabs({
  tabs,
  active,
  onChange,
  label,
  equal,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  label?: string;
  /** Equal-width segmented tabs (e.g. under a modal title). */
  equal?: boolean;
}) {
  return (
    <div className={`page-tabs${equal ? " tabs-equal" : ""}`} role="tablist" aria-label={label}>
      <div className="page-tabs-scroller">
        {tabs.map((tab, i) => {
          const edge =
            tabs.length === 1
              ? " is-first is-last"
              : i === 0
                ? " is-first"
                : i === tabs.length - 1
                  ? " is-last"
                  : "";
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              className={`page-tab${active === tab.id ? " active" : ""}${edge}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
