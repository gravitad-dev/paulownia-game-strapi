import { Box, Typography, Flex, Grid } from "@strapi/design-system";
import styled from "styled-components";
import type { EconomyStats, SessionData } from "../api/stats";

interface EconomyCardProps {
  stats: EconomyStats | null;
  sessions?: SessionData[];
  loading?: boolean;
}

const CardWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
`;

const StatBox = styled(Box)`
  text-align: center;
  padding: 16px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.neutral100};
`;

const StatValue = styled(Typography)`
  font-size: 24px;
  font-weight: 700;
  margin-top: 8px;
  display: block;
`;

const ProgressBar = styled(Box)<{ $percentage: number; $color: string }>`
  height: 8px;
  background: ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;

  &::after {
    content: "";
    display: block;
    height: 100%;
    width: ${({ $percentage }) => Math.min($percentage, 100)}%;
    background: ${({ $color }) => $color};
    border-radius: 4px;
    transition: width 0.5s ease;
  }
`;

export const EconomyCard = ({ stats, sessions, loading }: EconomyCardProps) => {
  if (loading || !stats) {
    return (
      <CardWrapper>
        <Typography variant="beta" textColor="neutral800">
          💰 Economía del Juego
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">
            Cargando estadísticas económicas...
          </Typography>
        </Box>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper style={{ width: "100%" }}>
      <Typography
        variant="beta"
        textColor="neutral800"
        style={{ marginBottom: "16px", display: "block" }}
      >
        💰 Economía del Juego
      </Typography>

      <Grid.Root gap={4}>
        <Grid.Item col={4} s={4} xs={12}>
          <StatBox>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ textTransform: "uppercase" }}
            >
              Monedas en Circulación
            </Typography>
            <StatValue textColor="warning600">
              🪙 {(stats.totalCoins || 0).toLocaleString()}
            </StatValue>
          </StatBox>
        </Grid.Item>

        <Grid.Item col={4} s={4} xs={12}>
          <StatBox>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ textTransform: "uppercase" }}
            >
              Total Ganadas
            </Typography>
            <StatValue textColor="success600">
              +{(stats.totalCoinsEarned || 0).toLocaleString()}
            </StatValue>
          </StatBox>
        </Grid.Item>

        <Grid.Item col={4} s={4} xs={12}>
          <StatBox>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ textTransform: "uppercase" }}
            >
              Total Gastadas
            </Typography>
            <StatValue textColor="danger600">
              -{(stats.totalCoinsSpent || 0).toLocaleString()}
            </StatValue>
          </StatBox>
        </Grid.Item>
      </Grid.Root>

      <Box marginTop={6}>
        <Flex justifyContent="space-between" alignItems="center">
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "start",
              gap: 4,
            }}
          >
            <Typography variant="pi" textColor="neutral600" fontWeight="bold">
              🔄 Tasa de Circulación
            </Typography>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ fontSize: "12px" }}
            >
              Porcentaje de monedas gastadas vs ganadas
            </Typography>
          </Box>
          <Typography
            variant="pi"
            textColor={
              stats.circulationRate > 70
                ? "success600"
                : stats.circulationRate > 40
                  ? "warning600"
                  : "danger600"
            }
            fontWeight="bold"
            style={{
              marginLeft: 8,
              fontSize: "14px",
              padding: "4px 8px",
              backgroundColor:
                stats.circulationRate > 70
                  ? "rgba(102,203,159,0.1)"
                  : stats.circulationRate > 40
                    ? "rgba(255,193,7,0.1)"
                    : "rgba(245,101,101,0.1)",
              borderRadius: "12px",
            }}
          >
            {String(stats.circulationRate || 0)}%
          </Typography>
        </Flex>

        <Box style={{ marginTop: 12 }}>
          <ProgressBar
            $percentage={stats.circulationRate || 0}
            $color={
              stats.circulationRate > 70
                ? "#66CB9F"
                : stats.circulationRate > 40
                  ? "#FFC107"
                  : "#F56565"
            }
          />
          <Flex justifyContent="space-between" style={{ marginTop: 8 }}>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ fontSize: "11px" }}
            >
              Baja circulación
            </Typography>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ fontSize: "11px" }}
            >
              Circulación ideal
            </Typography>
            <Typography
              variant="pi"
              textColor="neutral600"
              style={{ fontSize: "11px" }}
            >
              Alta circulación
            </Typography>
          </Flex>
        </Box>
      </Box>

      <Box marginTop={6}>
        <Grid.Root gap={4}>
          <Grid.Item col={4} s={4} xs={12}>
            <StatBox>
              <Typography
                variant="pi"
                textColor="neutral600"
                style={{ textTransform: "uppercase" }}
              >
                🎟️ Total Tickets
              </Typography>
              <StatValue textColor="primary600">
                {(stats.totalTickets || 0).toLocaleString()}
              </StatValue>
            </StatBox>
          </Grid.Item>

          <Grid.Item col={4} s={4} xs={12}>
            <StatBox>
              <Typography
                variant="pi"
                textColor="neutral600"
                style={{ textTransform: "uppercase" }}
              >
                Promedio Monedas/Jugador
              </Typography>
              <StatValue textColor="neutral800">
                {(stats.avgCoinsPerPlayer || 0).toLocaleString()}
              </StatValue>
            </StatBox>
          </Grid.Item>

          <Grid.Item col={4} s={4} xs={12}>
            <StatBox>
              <Typography
                variant="pi"
                textColor="neutral600"
                style={{ textTransform: "uppercase" }}
              >
                Promedio Tickets/Jugador
              </Typography>
              <StatValue textColor="neutral800">
                {(stats.avgTicketsPerPlayer || 0).toLocaleString()}
              </StatValue>
            </StatBox>
          </Grid.Item>
        </Grid.Root>
      </Box>
    </CardWrapper>
  );
};
