import { Box, Typography, Flex, Divider } from "@strapi/design-system";
import styled from "styled-components";
import type { LogEntry } from "../api/stats";

interface RecentLogsCardProps {
  logs: LogEntry[];
  loading?: boolean;
}

const CardWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
  height: 500px;
  display: flex;
  width: 100%;
  flex-direction: column;
`;

const LogItem = styled(Box)`
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral150};

  &:last-child {
    border-bottom: none;
  }
`;

const LogAction = styled(Typography)`
  font-weight: 600;
  display: block;
  margin-bottom: 4px;
`;

const LogMeta = styled(Flex)`
  gap: 8px;
`;

const formatDetails = (action: string, details: any) => {
  if (!details) return null;

  // Parse details if it's a string
  const d = typeof details === "string" ? JSON.parse(details) : details;
  const data = d.requestBody?.data || d.requestBody || {};
  let content = "";

  switch (action) {
    case "coin_exchange":
      if (data.ticketsRequested) {
        content = `Canje por ${data.ticketsRequested} tickets`;
      } else {
        content = "Canje de monedas";
      }
      break;
    case "daily_reward_claim":
      content = "Reclamo realizado";
      break;
    case "achievement_claim":
      if (data.achievementUuid) {
        content = `UUID: ${data.achievementUuid.substring(0, 8)}...`;
      } else {
        content = "Reclamo completado";
      }
      break;
    case "roulette_play":
      content = "Tirada realizada";
      break;
    default:
      content = "";
  }

  if (d.ip && d.ip !== "unknown") {
    content = content ? `${content} • IP: ${d.ip}` : `IP: ${d.ip}`;
  }

  return content;
};

const normalizeAction = (action: string) => {
  switch (action) {
    case "coin_exchange":
      return "Intercambio de Moneda";
    case "daily_reward_claim":
      return "Recompensa Diaria";
    case "achievement_claim":
      return "Logro";
    case "roulette_play":
      return "Ruleta";
    default:
      return action;
  }
};

export const RecentLogsCard = ({ logs, loading }: RecentLogsCardProps) => {
  if (loading) {
    return (
      <CardWrapper>
        <Typography variant="beta" textColor="neutral800">
          📜 Últimos Logs
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">Cargando logs...</Typography>
        </Box>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper>
      <Typography
        variant="beta"
        textColor="neutral800"
        style={{ marginBottom: "16px", display: "block" }}
      >
        📜 Últimos Logs
      </Typography>

      <Box style={{ flex: 1, overflowY: "auto", paddingInline: "30px" }}>
        {logs.length === 0 ? (
          <Typography textColor="neutral600">No hay logs recientes</Typography>
        ) : (
          logs.map((log) => (
            <LogItem key={log.id}>
              <Flex justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <LogAction variant="omega" textColor="neutral800">
                    {normalizeAction(log.action)}
                  </LogAction>
                  <LogMeta>
                    <Typography variant="pi" textColor="neutral600">
                      👤 {log.user}
                    </Typography>
                    {log.details && (
                      <Typography variant="pi" textColor="neutral500">
                        - {formatDetails(log.action, log.details)}
                      </Typography>
                    )}
                  </LogMeta>
                </Box>
                <Typography variant="pi" textColor="neutral500">
                  {new Date(log.createdAt).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Typography>
              </Flex>
            </LogItem>
          ))
        )}
      </Box>
    </CardWrapper>
  );
};
