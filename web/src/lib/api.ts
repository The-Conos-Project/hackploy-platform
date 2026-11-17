export type Health = {
  status: string;
  version: string;
  docker: string;
  db: string;
};

export type PlatformStatus = {
  phase: string;
  message: string;
  version: string;
};

export type SessionUser = {
  id: string;
  username: string;
  role: "student" | "admin";
  path?: string;
  expires?: string;
};

export type CompetitionAward = {
  id: string;
  competition_id: string;
  user_id: string;
  kind: string;
  label: string;
  created_at?: string;
};

export type PublicProfile = {
  id: string;
  username: string;
  path: string;
  role?: "admin" | "student";
  points?: number;
  solved?: number;
  first_bloods?: number;
  awards?: CompetitionAward[];
};

export type Challenge = {
  id: string;
  name: string;
  display_name: string;
  description: string;
  image_tag: string;
  flags: string;
  credentials: string;
  build_status: string;
  source_path?: string;
  section?: string;
};

export type ImportResult = {
  set_name: string;
  image_tag: string;
  source_dir: string;
  challenge_ids: string[];
};

export type Group = {
  id: string;
  name: string;
  join_code: string;
  challenge_ids: string[];
  member_ids: string[];
  created_at?: string;
};

export type GroupAssignment = {
  id: string;
  group_id: string;
  set_key: string;
  display_name: string;
  deadline_at?: string | null;
  challenge_ids: string[];
  created_at?: string;
};

export type Competition = {
  id: string;
  name: string;
  join_code: string;
  max_teams: number;
  join_closes_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  duration_min: number;
  status: string;
  created_at?: string;
  challenge_ids?: string[];
  my_team?: Team;
  my_solves?: TeamSolve[];
};

export type Team = {
  id: string;
  competition_id: string;
  name: string;
  join_code: string;
  captain_user_id: string;
  created_at?: string;
  members?: { id: string; username: string; path: string }[];
};

export type TeamSolve = {
  team_id: string;
  challenge_id: string;
  flag: string;
  solved_by: string;
  solved_at: string;
};

export type CompetitionEvent = {
  id: string;
  competition_id: string;
  team_id: string;
  points_total: number;
  at: string;
};

export type LeaderboardRow = {
  user_id: string;
  username: string;
  points: number;
  solved: number;
};

export type LeaderboardBoard = {
  group_id: string;
  group_name: string;
  rows: LeaderboardRow[];
};

export type DomainInfo = {
  domain: string;
  public_ip: string;
};

export type AdminMetrics = {
  cpu_percent: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  mem_percent: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  disk_percent: number;
  load_1: number;
  num_cpu: number;
  active_labs: number;
  challenges: number;
  ready_challenges: number;
  groups: number;
  users: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const msg = (data.error || "").trim();
    throw new Error(msg || res.statusText || "Request failed");
  }
  return data;
}

export const api = {
  health: () => request<Health>("/health"),
  status: () => request<PlatformStatus>("/api/v1/status"),
  adminMetrics: () => request<AdminMetrics>("/api/v1/metrics"),
  version: () =>
    request<{
      version: string;
      challenge_format: string;
      instance_timeout_sec?: number;
    }>("/api/v1/version"),
  me: () => request<SessionUser>("/api/v1/auth/me"),
  register: (username: string, password: string) =>
    request<SessionUser>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<SessionUser>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  adminLogin: (username: string, password: string) =>
    request<SessionUser>("/api/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ ok: string }>("/api/v1/auth/logout", { method: "POST" }),
  changePassword: (current: string, next: string) =>
    request<{ ok: string }>("/api/v1/auth/password", {
      method: "POST",
      body: JSON.stringify({ current, next }),
    }),
  getProfile: (slug: string) =>
    request<PublicProfile>(`/api/v1/u/${encodeURIComponent(slug)}`),
  listChallenges: () =>
    request<{ challenges: Challenge[] }>("/api/v1/challenges/"),
  importUpload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportResult>("/api/v1/challenges/import", {
      method: "POST",
      body: fd,
    });
  },
  importURL: (url: string) =>
    request<ImportResult>("/api/v1/challenges/import-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  deleteChallenge: (id: string) =>
    request<{ ok: string }>(`/api/v1/challenges/${id}`, { method: "DELETE" }),
  updateStatus: () => request<UpdateStatus>("/api/v1/updates/status"),
  applyUpdate: () =>
    request<{ ok: boolean; message: string }>("/api/v1/updates/apply", {
      method: "POST",
    }),
  buildChallenge: (id: string) =>
    request<{ ok: string; status: string }>(`/api/v1/challenges/${id}/build`, {
      method: "POST",
    }),
  buildLog: (id: string) =>
    request<{ log: string }>(`/api/v1/challenges/${id}/build-log`),
  startLab: (challengeId: string) =>
    request<LabInstance>("/api/v1/labs/start", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId }),
    }),
  stopLab: (id: string) =>
    request<{ ok: string }>(`/api/v1/labs/${id}/stop`, { method: "POST" }),
  extendLab: (id: string) =>
    request<LabInstance>(`/api/v1/labs/${id}/extend`, { method: "POST" }),
  listLabs: () => request<{ labs: LabInstance[] }>("/api/v1/labs/"),
  submitFlag: (id: string, flag: string, opts?: { flagIndex?: number; challengeId?: string }) =>
    request<{
      ok: boolean;
      accepted: string;
      completed: number;
      total: number;
      points: number;
      challenge_id?: string;
    }>(`/api/v1/labs/${id}/flag`, {
      method: "POST",
      body: JSON.stringify({
        flag,
        ...(opts?.flagIndex !== undefined ? { flag_index: opts.flagIndex } : {}),
        ...(opts?.challengeId ? { challenge_id: opts.challengeId } : {}),
      }),
    }),
  listUsers: () =>
    request<{
      users: { id: string; username: string; path: string; role?: string }[];
    }>("/api/v1/users/"),
  listGroups: () => request<{ groups: Group[] }>("/api/v1/groups/"),
  createGroup: (name: string) =>
    request<Group>("/api/v1/groups/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getGroup: (id: string) => request<Group>(`/api/v1/groups/${id}`),
  groupBloods: (id: string) =>
    request<{ bloods: Record<string, string> }>(`/api/v1/groups/${id}/bloods`),
  groupSetStats: (id: string, set?: string) =>
    request<{
      set?: string;
      bloods: Record<string, string>;
      solves: Record<string, number>;
      solvers: Record<string, { username: string; at: string }[]>;
      board: {
        user_id: string;
        username: string;
        points: number;
        solved: number;
        first_bloods: number;
      }[];
    }>(
      `/api/v1/groups/${id}/set-stats${set ? `?set=${encodeURIComponent(set)}` : ""}`,
    ),
  groupMembers: (id: string) =>
    request<{
      members: { id: string; username: string; path: string }[];
      count: number;
    }>(`/api/v1/groups/${id}/members`),
  deleteGroup: (id: string) =>
    request<{ ok: string }>(`/api/v1/groups/${id}`, { method: "DELETE" }),
  joinGroup: (code: string) =>
    request<Group>("/api/v1/groups/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  assignLabs: (id: string, challengeIds: string[]) =>
    request<Group>(`/api/v1/groups/${id}/labs`, {
      method: "PUT",
      body: JSON.stringify({ challenge_ids: challengeIds }),
    }),
  listAssignments: (id: string) =>
    request<{ assignments: GroupAssignment[] }>(`/api/v1/groups/${id}/assignments`),
  createAssignment: (
    id: string,
    body: {
      set_key: string;
      display_name: string;
      deadline_at?: string;
      challenge_ids: string[];
    },
  ) =>
    request<GroupAssignment>(`/api/v1/groups/${id}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAssignment: (
    id: string,
    aid: string,
    body: Partial<{
      set_key: string;
      display_name: string;
      deadline_at: string;
      challenge_ids: string[];
      clear_deadline: boolean;
    }>,
  ) =>
    request<GroupAssignment>(`/api/v1/groups/${id}/assignments/${aid}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAssignment: (id: string, aid: string) =>
    request<{ ok: string }>(`/api/v1/groups/${id}/assignments/${aid}`, {
      method: "DELETE",
    }),
  listCompetitions: () =>
    request<{ competitions: Competition[] }>("/api/v1/competitions/"),
  createCompetition: (body: {
    name: string;
    max_teams?: number;
    duration_min?: number;
    join_closes_at?: string;
  }) =>
    request<Competition>("/api/v1/competitions/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getCompetition: (id: string) => request<Competition>(`/api/v1/competitions/${id}`),
  updateCompetition: (
    id: string,
    body: Partial<{
      name: string;
      max_teams: number;
      duration_min: number;
      join_closes_at: string;
      status: string;
    }>,
  ) =>
    request<Competition>(`/api/v1/competitions/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCompetition: (id: string) =>
    request<{ ok: string }>(`/api/v1/competitions/${id}`, { method: "DELETE" }),
  setCompetitionChallenges: (id: string, challengeIds: string[]) =>
    request<{ challenge_ids: string[] }>(`/api/v1/competitions/${id}/challenges`, {
      method: "PUT",
      body: JSON.stringify({ challenge_ids: challengeIds }),
    }),
  startCompetition: (id: string) =>
    request<Competition>(`/api/v1/competitions/${id}/start`, { method: "POST" }),
  endCompetition: (id: string) =>
    request<Competition>(`/api/v1/competitions/${id}/end`, { method: "POST" }),
  joinCompetition: (code: string) =>
    request<Competition>("/api/v1/competitions/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  listCompetitionTeams: (id: string) =>
    request<{ teams: Team[] }>(`/api/v1/competitions/${id}/teams`),
  createTeam: (id: string, name: string) =>
    request<Team>(`/api/v1/competitions/${id}/teams`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  joinTeam: (id: string, code: string) =>
    request<Team>(`/api/v1/competitions/${id}/teams/join`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  submitCompetitionFlag: (id: string, challengeId: string, flag: string) =>
    request<{
      ok: boolean;
      already?: boolean;
      partial?: boolean;
      accepted?: string;
      points?: number;
      team_pts?: number;
      completed?: number;
      total?: number;
    }>(`/api/v1/competitions/${id}/flag`, {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, flag }),
    }),
  competitionStats: (id: string) =>
    request<{
      board: { team_id: string; team_name: string; points: number; solved: number }[];
      events: CompetitionEvent[];
      awards: CompetitionAward[];
      solves: TeamSolve[];
      status: string;
      ends_at?: string | null;
    }>(`/api/v1/competitions/${id}/stats`),
  leaderboard: (groupId?: string) =>
    request<{ boards: LeaderboardBoard[] }>(
      `/api/v1/leaderboard${groupId ? `?group_id=${encodeURIComponent(groupId)}` : ""}`,
    ),
  getDomain: () => request<DomainInfo>("/api/v1/domain/"),
  saveDomain: (domain: string) =>
    request<DomainInfo>("/api/v1/domain/", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  issueCertificate: (email: string) =>
    request<{ ok: boolean; domain: string }>("/api/v1/domain/certificate", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};

export type LabInstance = {
  id: string;
  user_id: string;
  challenge_id: string;
  host_port?: number;
  connection_type: string;
  status: string;
  expires_at?: string;
  username?: string;
  password?: string;
  submitted_flags?: string;
  attempt_counts?: string;
  image_tag?: string;
  challenge_name?: string;
  set_name?: string;
};

export type UpdateStatus = {
  current: string;
  remote_version?: string;
  image: string;
  tag: string;
  local_digest?: string;
  remote_digest?: string;
  update_available: boolean;
  checked_at: string;
  error?: string;
};
