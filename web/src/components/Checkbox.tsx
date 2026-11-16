import { Check, Minus } from "lucide-react";

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  indeterminate?: boolean;
}) {
  return (
    <label className="hp-check">
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        className={`hp-check-box${checked || indeterminate ? " is-on" : ""}${indeterminate ? " is-mixed" : ""}`}
        onClick={() => onChange(indeterminate ? true : !checked)}
      >
        {indeterminate ? (
          <Minus size={12} strokeWidth={3} />
        ) : checked ? (
          <Check size={12} strokeWidth={3} />
        ) : null}
      </button>
      {label ? <span className="hp-check-label">{label}</span> : null}
    </label>
  );
}
