import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { LandingPage } from "@/pages/Landing";
import { SignInPage } from "@/pages/SignIn";
import { SignUpPage } from "@/pages/SignUp";
import { ResetPasswordPage } from "@/pages/ResetPassword";
import { NotFoundPage } from "@/pages/NotFound";
import { ProfilePage } from "@/pages/Profile";
import { AdminOverviewPage } from "@/pages/admin/Overview";
import { AdminChallengesPage } from "@/pages/admin/Challenges";
import { AdminGroupsPage } from "@/pages/admin/Groups";
import { AdminGroupDetailPage } from "@/pages/admin/GroupDetail";
import { AdminPlaceholderPage } from "@/pages/admin/Placeholder";
import { AdminSettingsPage } from "@/pages/admin/Settings";
import { LeaderboardPage } from "@/pages/Leaderboard";
import { StudentDashboardPage } from "@/pages/student/Dashboard";
import { StudentGroupsPage } from "@/pages/student/Groups";
import { StudentGroupDetailPage } from "@/pages/student/GroupDetail";
import { StudentPackageDetailPage } from "@/pages/student/PackageDetail";
import { ChangePasswordPage } from "@/pages/student/ChangePassword";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/u/:slug" element={<ProfilePage />} />

        <Route
          path="/admin"
          element={
            <RequireAuth role="admin">
              <AdminOverviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/labs"
          element={
            <RequireAuth role="admin">
              <AdminChallengesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/groups"
          element={
            <RequireAuth role="admin">
              <AdminGroupsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/groups/:id"
          element={
            <RequireAuth role="admin">
              <AdminGroupDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/leaderboard"
          element={
            <RequireAuth role="admin">
              <LeaderboardPage role="admin" />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth role="admin">
              <AdminPlaceholderPage titleKey="nav_users" />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAuth role="admin">
              <AdminSettingsPage />
            </RequireAuth>
          }
        />

        <Route path="/admin/challenges" element={<Navigate to="/admin/labs" replace />} />
        <Route path="/admin/classes" element={<Navigate to="/admin/groups" replace />} />

        <Route
          path="/dashboard"
          element={
            <RequireAuth role="student">
              <StudentDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireAuth role="student">
              <StudentGroupsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <RequireAuth role="student">
              <StudentGroupDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:id/packages/:pkg"
          element={
            <RequireAuth role="student">
              <StudentPackageDetailPage />
            </RequireAuth>
          }
        />
        <Route path="/classes" element={<Navigate to="/groups" replace />} />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth role="student">
              <LeaderboardPage role="student" />
            </RequireAuth>
          }
        />
        <Route
          path="/change-password"
          element={
            <RequireAuth role="student">
              <ChangePasswordPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
