import { useFetchClient } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "../pluginId";

// Interfaces for dashboard statistics
export interface OverviewStats {
  totalUsers: number;
  activeSessions: number;
  totalGamesPlayed: number;
  totalCoinsEarned: number;
  sessionsToday: number;
  avgSessionDuration: number;
  avgWinRate: number;
  totalGamesWon: number;
}

export interface SessionData {
  date: string;
  sessions: number;
  games: number;
  score: number;
  coins: number;
}

export interface TopPlayer {
  rank: number;
  username: string;
  score: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  coins: number;
  tickets: number;
}

export interface EconomyStats {
  totalCoins: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  totalTickets: number;
  totalTicketsEarned: number;
  totalTicketsSpent: number;
  avgCoinsPerPlayer: number;
  avgTicketsPerPlayer: number;
  circulationRate: number;
}

export interface LogEntry {
  id: number;
  action: string;
  user: string;
  details: any;
  createdAt: string;
}

export interface PendingClaim {
  documentId: number;
  claimCode: string;
  user: string;
  fullName: string;
  rewardName: string;
  createdAt: string;
  requiresIdentityVerification: boolean;
}

export const useStatsApi = () => {
  const { get } = useFetchClient();

  const fetchOverview = async (): Promise<OverviewStats> => {
    try {
      const { data } = await get(`/${PLUGIN_ID}/overview`);
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchOverview failed:", error);
      throw new Error("Failed to fetch overview");
    }
  };

  const fetchSessionsOverTime = async (
    startDate?: string,
    endDate?: string,
  ): Promise<SessionData[]> => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const queryString = params.toString();

      const { data } = await get(
        `/${PLUGIN_ID}/sessions-over-time${queryString ? `?${queryString}` : ""}`,
      );
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchSessionsOverTime failed:", error);
      throw new Error("Failed to fetch sessions");
    }
  };

  const fetchTopPlayers = async (limit = 10): Promise<TopPlayer[]> => {
    try {
      const { data } = await get(`/${PLUGIN_ID}/top-players?limit=${limit}`);
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchTopPlayers failed:", error);
      throw new Error("Failed to fetch top players");
    }
  };

  const fetchEconomyStats = async (): Promise<EconomyStats> => {
    try {
      const { data } = await get(`/${PLUGIN_ID}/economy`);
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchEconomyStats failed:", error);
      throw new Error("Failed to fetch economy");
    }
  };

  const fetchLogs = async (limit = 10): Promise<LogEntry[]> => {
    try {
      const { data } = await get(`/${PLUGIN_ID}/logs?limit=${limit}`);
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchLogs failed:", error);
      throw new Error("Failed to fetch logs");
    }
  };

  const fetchPendingClaims = async (): Promise<PendingClaim[]> => {
    try {
      const { data } = await get(`/${PLUGIN_ID}/pending-claims`);
      return data;
    } catch (error) {
      console.error("[GameDashboard] fetchPendingClaims failed:", error);
      throw new Error("Failed to fetch pending claims");
    }
  };

  return {
    fetchOverview,
    fetchSessionsOverTime,
    fetchTopPlayers,
    fetchEconomyStats,
    fetchLogs,
    fetchPendingClaims,
  };
};
