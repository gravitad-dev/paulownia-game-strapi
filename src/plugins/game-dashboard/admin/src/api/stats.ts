// import { useFetchClient } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "../pluginId";

interface OverviewStats {
  totalUsers: number;
  activeSessions: number;
  totalGamesPlayed: number;
  totalCoinsEarned: number;
  sessionsToday: number;
  avgSessionDuration: number;
  avgWinRate: number;
  totalGamesWon: number;
}

interface SessionData {
  date: string;
  sessions: number;
  games: number;
  score: number;
  coins: number;
}

interface TopPlayer {
  rank: number;
  username: string;
  score: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  coins: number;
}

interface EconomyStats {
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

export const useStatsApi = () => {
  // Using native fetch to access Custom API (public or token based)
  // Bypassing useFetchClient to avoid /admin prefix and strict auth for now.

  const fetchOverview = async (): Promise<OverviewStats> => {
    const response = await fetch(`/api/gamedashboarddata/overview`);
    if (!response.ok) {
      console.error("[GameDashboard] fetchOverview failed:", response.status, response.statusText);
      throw new Error("Failed to fetch overview");
    }
    const data = await response.json();
    return data;
  };

  const fetchSessionsOverTime = async (
    startDate?: string,
    endDate?: string,
  ): Promise<SessionData[]> => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    const queryString = params.toString();
    
    const response = await fetch(`/api/gamedashboarddata/sessions-over-time${queryString ? `?${queryString}` : ""}`);
    if (!response.ok) {
       throw new Error("Failed to fetch sessions");
    }
    const data = await response.json();

    return data;
  };

  const fetchTopPlayers = async (limit = 10): Promise<TopPlayer[]> => {
    const response = await fetch(`/api/gamedashboarddata/top-players?limit=${limit}`);
    if (!response.ok) {
       throw new Error("Failed to fetch top players");
    }
    const data = await response.json();

    return data;
  };

  const fetchEconomyStats = async (): Promise<EconomyStats> => {
    const response = await fetch(`/api/gamedashboarddata/economy`);
    if (!response.ok) {
       throw new Error("Failed to fetch economy");
    }
    const data = await response.json();

    return data;
  };

  return {
    fetchOverview,
    fetchSessionsOverTime,
    fetchTopPlayers,
    fetchEconomyStats,
  };
};

export type { OverviewStats, SessionData, TopPlayer, EconomyStats };
