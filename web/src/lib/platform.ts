/**
 * Platform reads — production API only.
 */
import {
  api,
  type AdminMetrics,
  type Challenge,
  type DomainInfo,
  type Group,
  type LeaderboardBoard,
  type UpdateStatus,
} from "./api";

export async function getAdminMetrics(): Promise<AdminMetrics> {
  return api.adminMetrics();
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return api.updateStatus();
}

export async function getDomain(): Promise<DomainInfo> {
  return api.getDomain();
}

export async function listGroups(): Promise<Group[]> {
  const res = await api.listGroups();
  return res.groups ?? [];
}

export async function getGroup(id: string): Promise<Group> {
  return api.getGroup(id);
}

export async function assignLabs(id: string, challengeIds: string[]): Promise<Group> {
  return api.assignLabs(id, challengeIds);
}

export async function listUsers(): Promise<{ id: string; username: string; path: string }[]> {
  const res = await api.listUsers();
  return res.users ?? [];
}

export async function listChallenges(): Promise<Challenge[]> {
  const res = await api.listChallenges();
  return res.challenges ?? [];
}

export async function getLeaderboard(): Promise<LeaderboardBoard[]> {
  const res = await api.leaderboard();
  return res.boards ?? [];
}
