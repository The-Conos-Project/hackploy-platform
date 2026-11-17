import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Trophy,
  UserRound,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { api, type Group, type UpdateStatus } from "@/lib/api";
import { getUpdateStatus, listGroups } from "@/lib/platform";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
import { LangSwitch } from "./LangSwitch";

type NavItem = { key: string; to: string; label: string; icon: ReactNode };

export function Shell({
  role,
  children,
}: {
  role: "admin" | "student";
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hackploy-sidebar") === "1",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [version, setVersion] = useState<string>("…");
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [verOpen, setVerOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("hackploy-sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    void api
      .version()
      .then((v) => setVersion(v.version))
      .catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    void listGroups()
      .then((data) => setGroups(data))
      .catch(() => setGroups([]));
  }, []);

  const checkUpdates = useCallback(async () => {
    if (role !== "admin") return;
    try {
      const st = await getUpdateStatus();
      setUpdate(st);
      if (st.current) setVersion(st.current);
    } catch {
      /* hub offline */
    }
  }, [role]);

  useEffect(() => {
    void checkUpdates();
    if (role !== "admin") return;
    const id = window.setInterval(() => void checkUpdates(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [checkUpdates, role]);

  useEffect(() => {
    if (!verOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setVerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [verOpen]);

  const onUpgrade = async () => {
    setUpdating(true);
    try {
      const res = await api.applyUpdate();
      toast.success(res.message || t("update_started"));
      setVerOpen(false);
      // Progress UI takes over via nginx while platform recreates.
      window.setTimeout(() => {
        window.location.replace(`/?updating=${Date.now()}`);
      }, 400);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "update failed");
      setUpdating(false);
    }
  };

  const closeMobile = () => setMobileOpen(false);

  const profileTo = user?.path || `/u/${user?.id || ""}`;

  const userLabel = user?.username || t("nav_profile");

  const adminNav: NavItem[] = [
    { key: "home", to: "/admin", label: t("nav_overview"), icon: <LayoutDashboard /> },
    { key: "labs", to: "/admin/labs", label: t("nav_challenges"), icon: <Workflow /> },
    { key: "leaderboard", to: "/admin/leaderboard", label: t("nav_leaderboard"), icon: <Trophy /> },
    { key: "users", to: "/admin/users", label: t("nav_users"), icon: <Users /> },
    { key: "profile", to: profileTo, label: userLabel, icon: <UserRound /> },
    { key: "settings", to: "/admin/settings", label: t("nav_settings"), icon: <Settings /> },
  ];

  const studentNav: NavItem[] = [
    { key: "home", to: "/dashboard", label: t("nav_dashboard"), icon: <LayoutDashboard /> },
    { key: "leaderboard", to: "/leaderboard", label: t("nav_leaderboard"), icon: <Trophy /> },
    { key: "profile", to: profileTo, label: userLabel, icon: <UserRound /> },
    { key: "password", to: "/change-password", label: t("nav_password"), icon: <KeyRound /> },
  ];

  const links = role === "admin" ? adminNav : studentNav;
  const remoteHint =
    update?.remote_version ||
    (update?.remote_digest ? update.remote_digest.replace(/^sha256:/, "").slice(0, 12) : "") ||
    update?.tag ||
    "—";
  const groupsRoot = role === "admin" ? "/admin/groups" : "/groups";

  return (
    <div className={`shell${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`}>
      <div className="mobile-bar">
        <button type="button" className="icon-pill" aria-label="Menu" onClick={() => setMobileOpen(true)}>
          <Menu size={18} />
        </button>
        <strong className="mobile-brand">Hackploy</strong>
        <LangSwitch compact />
      </div>

      {mobileOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close" onClick={closeMobile} /> : null}

      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <img
              className="brand-logo"
              src="/logos/logo-transparent-dark.png"
              alt=""
              width={28}
              height={28}
            />
            <button
              type="button"
              className="brand-expand"
              aria-label="Open sidebar"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeftOpen size={18} />
            </button>
            <div className="brand-text">
              <strong>Hackploy</strong>
            </div>
          </div>
          <div className="sidebar-top-actions">
            <button type="button" className="icon-pill mobile-only" aria-label="Close" onClick={closeMobile}>
              <X size={18} />
            </button>
            {!collapsed ? (
              <button
                type="button"
                className="icon-pill desktop-only"
                aria-label="Collapse sidebar"
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose size={18} />
              </button>
            ) : null}
          </div>
        </div>

        <nav className="nav">
          {links.slice(0, 1).map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              title={item.label}
              onClick={closeMobile}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}

          <div className={`nav-group${groupsOpen && !collapsed ? " is-open" : ""}`}>
            {collapsed ? (
              <NavLink
                to={groupsRoot}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                title={role === "admin" ? t("nav_classes") : t("nav_my_classes")}
                onClick={closeMobile}
              >
                <span className="nav-icon">
                  <Users />
                </span>
                <span className="nav-label">
                  {role === "admin" ? t("nav_classes") : t("nav_my_classes")}
                </span>
              </NavLink>
            ) : (
              <button
                type="button"
                className="nav-link nav-group-toggle"
                onClick={() => setGroupsOpen((v) => !v)}
                title={role === "admin" ? t("nav_classes") : t("nav_my_classes")}
              >
                <span className="nav-icon">
                  <Users />
                </span>
                <span className="nav-label">
                  {role === "admin" ? t("nav_classes") : t("nav_my_classes")}
                </span>
                <ChevronDown size={16} className="nav-chevron" />
              </button>
            )}
            {groupsOpen && !collapsed ? (
              <div className="nav-sub">
                <NavLink
                  to={groupsRoot}
                  end
                  className={({ isActive }) => (isActive ? "nav-sub-link active" : "nav-sub-link")}
                  onClick={closeMobile}
                >
                  {t("all_groups")}
                </NavLink>
                {groups.map((g) => (
                  <NavLink
                    key={g.id}
                    to={`${groupsRoot}/${g.id}`}
                    className={({ isActive }) => (isActive ? "nav-sub-link active" : "nav-sub-link")}
                    onClick={closeMobile}
                  >
                    {g.name}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>

          {links.slice(1).map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              title={item.label}
              onClick={closeMobile}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-meta-row">
            {version ? (
              <div className="version-wrap" ref={popupRef}>
                <button
                  type="button"
                  className={`version-chip${update?.update_available ? " has-update" : ""}`}
                  onClick={() => {
                    if (role !== "admin") return;
                    setVerOpen((v) => !v);
                    void checkUpdates();
                  }}
                  title={t("version")}
                >
                  <span className="version-inline">
                    <span className="version-label">{t("version")}</span>
                    <span className="font-mono version-value">{version}</span>
                    {update?.update_available ? <span className="update-dot" /> : null}
                  </span>
                </button>
                {role === "admin" && verOpen ? (
                  <div className="version-popup">
                    <div className="version-popup-row">
                      <span>{t("current_version")}</span>
                      <code>{version}</code>
                    </div>
                    <div className="version-popup-row">
                      <span>{t("new_version")}</span>
                      <code>{update?.update_available ? remoteHint : version}</code>
                    </div>
                    <button
                      type="button"
                      disabled={updating || !update?.update_available}
                      onClick={() => void onUpgrade()}
                    >
                      {updating ? t("loading") : t("update_now")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <span className="version-wrap-spacer" />
            )}
            <LangSwitch compact className="sidebar-lang" />
          </div>

          <button
            type="button"
            className="nav-link logout-btn"
            title={t("logout")}
            onClick={() =>
              void (async () => {
                await logout();
                navigate("/sign-in");
              })()
            }
          >
            <span className="nav-icon">
              <LogOut />
            </span>
            <span className="nav-label">{t("logout")}</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
