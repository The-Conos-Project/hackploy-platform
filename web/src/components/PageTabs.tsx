type Tab = { id: string; label: string };

export function PageTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="page-tabs" role="tablist" aria-label={label}>
      <div className="page-tabs-scroller">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? "page-tab active" : "page-tab"}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
