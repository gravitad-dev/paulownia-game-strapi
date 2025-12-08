import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Flex,
  Typography,
  Grid,
  SingleSelect,
  SingleSelectOption,
  DatePicker,
  Button,
} from "@strapi/design-system";
import { User, Clock, Play, ArrowUp } from "@strapi/icons";
import styled from "styled-components";

import {
  useStatsApi,
  type OverviewStats,
  type SessionData,
  type TopPlayer,
  type EconomyStats,
  type LogEntry,
  type PendingClaim,
} from "../api/stats";
import { StatsCard } from "../components/StatsCard";
import { TopPlayersTable } from "../components/TopPlayersTable";
import { SessionsChart } from "../components/SessionsChart";
import { EconomyCard } from "../components/EconomyCard";
import { RecentLogsCard } from "../components/RecentLogsCard";
import { PendingClaimsCard } from "../components/PendingClaimsCard";

const DashboardWrapper = styled(Box)`
  padding: 32px;
  background: ${({ theme }) => theme.colors.neutral100};
  min-height: 100vh;
`;

const Header = styled(Flex)`
  margin-bottom: 32px;
`;

const TitleBlock = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Section = styled(Box)`
  margin-bottom: 24px;
`;

const RefreshIndicator = styled(Typography)`
  font-size: 12px;
`;

const SelectWrapper = styled(Box)`
  min-width: 140px;
`;

const REFRESH_OPTIONS = [
  { value: "0", label: "Manual" },
  { value: "60000", label: "1 minuto" },
  { value: "300000", label: "5 minutos" },
  { value: "600000", label: "10 minutos" },
  { value: "1800000", label: "30 minutos" },
];

// Dashboard component
export const Dashboard = () => {
  const api = useStatsApi();

  // State
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [economy, setEconomy] = useState<EconomyStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Filters
  const [startDate, setStartDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [refreshInterval, setRefreshInterval] = useState("300000"); // 5 min default

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        overviewData,
        sessionsData,
        playersData,
        economyData,
        logsData,
        pendingClaimsData,
      ] = await Promise.all([
        api.fetchOverview(),
        api.fetchSessionsOverTime(
          startDate.toISOString(),
          endDate.toISOString(),
        ),
        api.fetchTopPlayers(10),
        api.fetchEconomyStats(),
        api.fetchLogs(10),
        api.fetchPendingClaims(),
      ]);

      setOverview(overviewData);
      setSessions(sessionsData);
      setTopPlayers(playersData);
      setEconomy(economyData);
      setLogs(logsData);
      setPendingClaims(pendingClaimsData);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [api, startDate, endDate]);

  // Initial load
  useEffect(() => {
    fetchAllData();
  }, []);

  // Date filter change
  useEffect(() => {
    if (!loading) {
      fetchAllData();
    }
  }, [startDate, endDate]);

  // Auto-refresh
  useEffect(() => {
    const interval = parseInt(refreshInterval, 10);
    if (interval > 0) {
      const timer = setInterval(() => {
        fetchAllData();
      }, interval);
      return () => clearInterval(timer);
    }
  }, [refreshInterval, fetchAllData]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  return (
    <DashboardWrapper>
      <Header justifyContent="space-between" alignItems="center">
        <TitleBlock>
          <Typography
            variant="alpha"
            textColor="neutral800"
            style={{ display: "block" }}
          >
            🎮 Game Dashboard
          </Typography>
          <Typography
            variant="epsilon"
            textColor="neutral600"
            style={{ display: "block" }}
          >
            Estadísticas y análisis del juego
          </Typography>
        </TitleBlock>

        <Flex gap={4} alignItems="center">
          <Flex gap={2} alignItems="center">
            <Typography variant="pi" textColor="neutral600">
              Desde:
            </Typography>
            <DatePicker
              value={startDate}
              onChange={(date) => date && setStartDate(date)}
              size="S"
            />
          </Flex>

          <Flex gap={2} alignItems="center">
            <Typography variant="pi" textColor="neutral600">
              Hasta:
            </Typography>
            <DatePicker
              value={endDate}
              onChange={(date) => date && setEndDate(date)}
              size="S"
            />
          </Flex>

          <SelectWrapper>
            <SingleSelect
              value={refreshInterval}
              onChange={(value) => setRefreshInterval(value as string)}
              size="S"
            >
              {REFRESH_OPTIONS.map((opt) => (
                <SingleSelectOption key={opt.value} value={opt.value}>
                  🔄 {opt.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </SelectWrapper>

          <Button
            onClick={fetchAllData}
            loading={loading}
            size="S"
            variant="secondary"
          >
            Actualizar
          </Button>
        </Flex>
      </Header>

      <RefreshIndicator textColor="neutral500" style={{ marginBottom: "16px" }}>
        Última actualización: {lastRefresh.toLocaleTimeString("es-ES")}
      </RefreshIndicator>

      {/* KPI Cards */}
      <Section>
        <Grid.Root gap={4}>
          <Grid.Item col={3} s={6}>
            <StatsCard
              title="Total Usuarios"
              value={overview?.totalUsers || 0}
              icon={<User />}
              color="#7B79FF"
            />
          </Grid.Item>
          <Grid.Item col={3} s={6}>
            <StatsCard
              title="Sesiones Activas"
              value={overview?.activeSessions || 0}
              icon={<Play />}
              color="#66CB9F"
              subtitle="Ahora mismo"
            />
          </Grid.Item>
          <Grid.Item col={3} s={6}>
            <StatsCard
              title="Total Partidas"
              value={overview?.totalGamesPlayed?.toLocaleString() || "0"}
              icon={<ArrowUp />}
              color="#EE5E52"
            />
          </Grid.Item>
          <Grid.Item col={3} s={6}>
            <StatsCard
              title="Duración Promedio"
              value={formatDuration(overview?.avgSessionDuration || 0)}
              icon={<Clock />}
              color="#F7C948"
            />
          </Grid.Item>
        </Grid.Root>
      </Section>

      {/* Secondary KPIs */}
      <Section>
        <Grid.Root gap={4}>
          <Grid.Item col={4} s={12}>
            <StatsCard
              title="Sesiones Hoy"
              value={overview?.sessionsToday || 0}
              color="#9B59B6"
            />
          </Grid.Item>
          <Grid.Item col={4} s={12}>
            <StatsCard
              title="Partidas Ganadas"
              value={overview?.totalGamesWon?.toLocaleString() || "0"}
              color="#27AE60"
            />
          </Grid.Item>
          <Grid.Item col={4} s={12}>
            <StatsCard
              title="Win Rate Promedio"
              value={`${overview?.avgWinRate || 0}%`}
              color="#3498DB"
            />
          </Grid.Item>
        </Grid.Root>
      </Section>

      {/* Main Content Row */}
      <Section>
        <Grid.Root gap={4}>
          <Grid.Item col={5} s={12}>
            <TopPlayersTable
              players={topPlayers}
              loading={loading}
              compact={false}
            />
          </Grid.Item>
          <Grid.Item col={4} s={12}>
            <PendingClaimsCard claims={pendingClaims} loading={loading} />
          </Grid.Item>
          <Grid.Item col={3} s={12}>
            <RecentLogsCard logs={logs} loading={loading} />
          </Grid.Item>
        </Grid.Root>
      </Section>

      <Section>
        <Grid.Root gap={4}>
          <Grid.Item col={6} s={12}>
            <SessionsChart data={sessions} loading={loading} />
          </Grid.Item>
          <Grid.Item col={6} s={12}>
            <EconomyCard
              stats={economy}
              sessions={sessions}
              loading={loading}
            />
          </Grid.Item>
        </Grid.Root>
      </Section>
    </DashboardWrapper>
  );
};
