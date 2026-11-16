import { Link } from "react-router-dom";

export function BrandMark({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand-mark" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <img src="/logos/logo-transparent-dark.png" alt="" width={28} height={28} />
      Hackploy
    </Link>
  );
}
