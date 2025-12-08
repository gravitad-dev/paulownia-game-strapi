import { Box, Typography, Flex, Badge } from "@strapi/design-system";
import styled from "styled-components";
import type { TopPlayer } from "../api/stats";

interface TopPlayersTableProps {
  players: TopPlayer[];
  loading?: boolean;
  compact?: boolean;
}

const TableWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
  height: 500px;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const RankBadge = styled(Box)<{ $rank: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 12px;
  min-width: 32px;
  background: ${({ $rank }) =>
    $rank === 1
      ? "#FFD700"
      : $rank === 2
        ? "#C0C0C0"
        : $rank === 3
          ? "#CD7F32"
          : "#E0E0E7"};
  color: ${({ $rank }) => ($rank <= 3 ? "#1C1C2E" : "#666687")};
`;

const TableGrid = styled(Box)<{ $compact?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $compact }) =>
    $compact ? "48px 1fr 80px" : "48px 1fr repeat(6, minmax(60px, 1fr))"};
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral200};
  align-items: center;

  &:last-child {
    border-bottom: none;
  }

  ${({ $compact }) =>
    $compact &&
    `
    & > *:nth-child(n + 4) {
      display: none;
    }
  `}

  @media (max-width: 900px) {
    grid-template-columns: 48px 1fr 80px;
    & > *:nth-child(n + 4) {
      display: none;
    }
  }
`;

const TableHeader = styled(TableGrid)`
  font-weight: 600;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral300};
`;

const WinRateContainer = styled(Box)`
  position: relative;
  height: 24px;
  background: ${({ theme }) => theme.colors.neutral150};
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
  max-width: 80px;
`;

const WinRateFill = styled(Box)<{ $width: number; $color: string }>`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: ${({ $width }) => $width}%;
  background: ${({ $color }) => $color};
  opacity: 0.3;
  transition: width 0.3s ease;
`;

const WinRateText = styled(Typography)`
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-weight: 700;
  font-size: 12px;
`;

export const TopPlayersTable = ({
  players,
  loading,
  compact,
}: TopPlayersTableProps) => {
  if (loading) {
    return (
      <TableWrapper>
        <Typography variant="beta" textColor="neutral800">
          🏆 Top Jugadores
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">Cargando...</Typography>
        </Box>
      </TableWrapper>
    );
  }

  return (
    <TableWrapper>
      <Typography
        variant="beta"
        textColor="neutral800"
        style={{ marginBottom: "16px", display: "block" }}
      >
        🏆 Top Jugadores
      </Typography>

      <Box style={{ flex: 1, overflowY: "auto" }}>
        <TableHeader $compact={compact}>
          <Typography variant="sigma" textColor="neutral600">
            Rank
          </Typography>
          <Typography variant="sigma" textColor="neutral600">
            Usuario
          </Typography>
          <Typography variant="sigma" textColor="neutral600">
            Puntuación
          </Typography>
          {!compact && (
            <>
              <Typography variant="sigma" textColor="neutral600">
                Partidas
              </Typography>
              <Typography variant="sigma" textColor="neutral600">
                Victorias
              </Typography>
              <Typography variant="sigma" textColor="neutral600">
                Win Rate
              </Typography>
              <Typography variant="sigma" textColor="neutral600">
                Tickets
              </Typography>
              <Typography variant="sigma" textColor="neutral600">
                Monedas
              </Typography>
            </>
          )}
        </TableHeader>

        {players.map((player) => (
          <TableGrid key={player.rank} $compact={compact}>
            <RankBadge $rank={player.rank}>#{player.rank}</RankBadge>
            <Typography textColor="neutral800" fontWeight="semiBold">
              {player.username}
            </Typography>
            <Typography textColor="neutral800">
              {player.score.toLocaleString()}
            </Typography>
            <Typography textColor="neutral600">{player.gamesPlayed}</Typography>
            <Typography textColor="success600">{player.gamesWon}</Typography>
            <WinRateContainer>
              <WinRateFill
                $width={player.winRate}
                $color={
                  player.winRate >= 70
                    ? "#66CB9F"
                    : player.winRate >= 40
                      ? "#FFC107"
                      : "#F56565"
                }
              />
              <WinRateText
                textColor={
                  player.winRate >= 70
                    ? "success700"
                    : player.winRate >= 40
                      ? "warning700"
                      : "danger700"
                }
              >
                {player.winRate}%
              </WinRateText>
            </WinRateContainer>
            <Typography textColor="lightgray">
              🎫 {player.tickets.toLocaleString()}
            </Typography>
            <Typography textColor="warning600">
              🪙 {player.coins.toLocaleString()}
            </Typography>
          </TableGrid>
        ))}
      </Box>
    </TableWrapper>
  );
};
