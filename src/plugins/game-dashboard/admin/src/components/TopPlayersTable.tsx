import { Box, Typography, Flex, Badge } from '@strapi/design-system';
import styled from 'styled-components';
import type { TopPlayer } from '../api/stats';

interface TopPlayersTableProps {
  players: TopPlayer[];
  loading?: boolean;
}

const TableWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
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
    $rank === 1 ? '#FFD700' : $rank === 2 ? '#C0C0C0' : $rank === 3 ? '#CD7F32' : '#E0E0E7'};
  color: ${({ $rank }) => ($rank <= 3 ? '#1C1C2E' : '#666687')};
`;

const TableGrid = styled(Box)`
  display: grid;
  grid-template-columns: 60px 1fr 100px 80px 80px 80px 100px;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral200};
  align-items: center;

  &:last-child {
    border-bottom: none;
  }
`;

const TableHeader = styled(TableGrid)`
  font-weight: 600;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral300};
`;

export const TopPlayersTable = ({ players, loading }: TopPlayersTableProps) => {
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
      <Typography variant="beta" textColor="neutral800" style={{ marginBottom: '16px', display: 'block' }}>
        🏆 Top Jugadores
      </Typography>
      
      <TableHeader>
        <Typography variant="sigma" textColor="neutral600">Rank</Typography>
        <Typography variant="sigma" textColor="neutral600">Usuario</Typography>
        <Typography variant="sigma" textColor="neutral600">Puntuación</Typography>
        <Typography variant="sigma" textColor="neutral600">Partidas</Typography>
        <Typography variant="sigma" textColor="neutral600">Victorias</Typography>
        <Typography variant="sigma" textColor="neutral600">Win Rate</Typography>
        <Typography variant="sigma" textColor="neutral600">Monedas</Typography>
      </TableHeader>

      {players.map((player) => (
        <TableGrid key={player.rank}>
          <RankBadge $rank={player.rank}>#{player.rank}</RankBadge>
          <Typography textColor="neutral800" fontWeight="semiBold">
            {player.username}
          </Typography>
          <Typography textColor="neutral800">
            {player.score.toLocaleString()}
          </Typography>
          <Typography textColor="neutral600">{player.gamesPlayed}</Typography>
          <Typography textColor="success600">{player.gamesWon}</Typography>
          <Badge
            backgroundColor={
              player.winRate >= 70 ? 'success100' : player.winRate >= 40 ? 'warning100' : 'danger100'
            }
            textColor={
              player.winRate >= 70 ? 'success700' : player.winRate >= 40 ? 'warning700' : 'danger700'
            }
          >
            {player.winRate}%
          </Badge>
          <Typography textColor="warning600">🪙 {player.coins.toLocaleString()}</Typography>
        </TableGrid>
      ))}
    </TableWrapper>
  );
};
