import { Box, Typography, Flex, Grid } from "@strapi/design-system";
import styled from "styled-components";
import type { EconomyStats } from "../api/stats";

interface EconomyCardProps {
  stats: EconomyStats | null;
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

export const EconomyCard = ({ stats, loading }: EconomyCardProps) => {
  if (loading || !stats) {
    return (
      <CardWrapper>
        <Typography variant="beta" textColor="neutral800">
          💰 Economía
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">Cargando...</Typography>
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
        💰 Economía del Juego
      </Typography>

      <Grid.Root gap={4}>
        <Grid.Item col={4} s={12}>
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

        <Grid.Item col={4} s={12}>
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

        <Grid.Item col={4} s={12}>
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

      <Box marginTop={4}>
        <Flex justifyContent="space-between">
          <Typography variant="pi" textColor="neutral600">
            Tasa de Circulación (Gastadas/Ganadas)
          </Typography>
          <Typography variant="pi" textColor="neutral800" fontWeight="bold">
            {stats.circulationRate || 0}%
          </Typography>
        </Flex>
        <ProgressBar
          $percentage={stats.circulationRate || 0}
          $color="#7B79FF"
        />
      </Box>

      <Box marginTop={5}>
        <Grid.Root gap={4}>
          <Grid.Item col={6} s={12}>
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

          <Grid.Item col={6} s={12}>
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
        </Grid.Root>
      </Box>
    </CardWrapper>
  );
};
