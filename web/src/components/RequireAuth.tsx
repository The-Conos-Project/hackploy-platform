import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";

export function RequireAuth({
  role,
  children,
}: {
  role?: "admin" | "student";
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div className="centered-page">
        <p className="muted">{t("loading")}</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (role === "admin" && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  if (role === "student" && user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
