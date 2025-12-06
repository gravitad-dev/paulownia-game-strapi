import { Box, Typography, Flex, SingleSelect, SingleSelectOption } from '@strapi/design-system';
import styled from 'styled-components';
import type { SessionData } from '../api/stats';

interface SessionsChartProps {
  data: SessionData[];
  loading?: boolean;
}

const ChartWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
`;

const ChartContainer = styled(Box)`
  height: 300px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding-top: 20px;
`;

const Bar = styled(Box)<{ $height: number; $color: string }>`
  flex: 1;
  height: ${({ $height }) => $height}%;
  background: ${({ $color }) => $color};
  border-radius: 4px 4px 0 0;
  min-width: 20px;
  max-width: 40px;
  transition: height 0.3s ease;
  position: relative;
  
  &:hover {
    opacity: 0.8;
  }
`;

const BarValue = styled(Typography)`
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
`;

const Legend = styled(Flex)`
  gap: 20px;
  margin-top: 40px;
  justify-content: center;
`;

const LegendItem = styled(Flex)`
  align-items: center;
  gap: 8px;
`;

const LegendDot = styled(Box)<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

export const SessionsChart = ({ data, loading }: SessionsChartProps) => {
  if (loading) {
    return (
      <ChartWrapper>
        <Typography variant="beta" textColor="neutral800">
          📊 Sesiones por Día
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">Cargando...</Typography>
        </Box>
      </ChartWrapper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartWrapper>
        <Typography variant="beta" textColor="neutral800">
          📊 Sesiones por Día
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">No hay datos disponibles</Typography>
        </Box>
      </ChartWrapper>
    );
  }

  const maxSessions = Math.max(...data.map((d) => d.sessions || 0), 1);
  const maxGames = Math.max(...data.map((d) => d.games || 0), 1);

  // Show last 14 days max for readability
  const displayData = data.slice(-14);

  return (
    <ChartWrapper>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta" textColor="neutral800">
          📊 Actividad por Día
        </Typography>
      </Flex>
      
      <ChartContainer>
        {displayData.map((item) => (
          <Flex key={item.date} direction="column" alignItems="center" style={{ flex: 1, position: 'relative' }}>
            <Flex gap={2} alignItems="flex-end" style={{ height: '100%' }}>
              <Bar $height={((item.sessions || 0) / maxSessions) * 100} $color="#7B79FF">
                {(item.sessions || 0) > 0 && <BarValue textColor="primary600">{item.sessions}</BarValue>}
              </Bar>
              <Bar $height={((item.games || 0) / maxGames) * 100} $color="#66CB9F">
                {(item.games || 0) > 0 && <BarValue textColor="success600">{item.games}</BarValue>}
              </Bar>
            </Flex>
            <Typography 
              variant="pi" 
              textColor="neutral500" 
              style={{ marginTop: '8px', fontSize: '10px' }}
            >
              {new Date(item.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
            </Typography>
          </Flex>
        ))}
      </ChartContainer>

      <Legend>
        <LegendItem>
          <LegendDot $color="#7B79FF" />
          <Typography variant="pi" textColor="neutral600">Sesiones</Typography>
        </LegendItem>
        <LegendItem>
          <LegendDot $color="#66CB9F" />
          <Typography variant="pi" textColor="neutral600">Partidas</Typography>
        </LegendItem>
      </Legend>
    </ChartWrapper>
  );
};
