import { Box, Typography, Flex } from "@strapi/design-system";
import styled from "styled-components";
import { useMemo } from "react";
import type { SessionData } from "../api/stats";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

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
          <Typography textColor="neutral600">
            No hay datos disponibles
          </Typography>
        </Box>
      </ChartWrapper>
    );
  }

  // Use last 3 entries for readability
  const displayData = data.slice(-3);

  const chartData = useMemo(() => {
    const labels = displayData.map((d) =>
      new Date(d.date).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      }),
    );
    const sessionsDataset = displayData.map((d) => d.sessions || 0);
    const gamesDataset = displayData.map((d) => d.games || 0);

    return {
      labels,
      datasets: [
        {
          label: "Sesiones",
          data: sessionsDataset,
          backgroundColor: "#7B79FF",
          maxBarThickness: 50,
          borderRadius: 4,
        },
        {
          label: "Partidas",
          data: gamesDataset,
          backgroundColor: "#66CB9F",
          maxBarThickness: 50,
          borderRadius: 4,
        },
      ],
    };
  }, [displayData]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" as const },
        title: { display: false },
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            color: "rgba(200, 200, 200, 0.2)",
            borderColor: "rgba(200, 200, 200, 0.2)",
          },
        },
        y: {
          stacked: false,
          beginAtZero: true,
          grid: {
            color: "rgba(200, 200, 200, 0.2)",
            borderColor: "rgba(200, 200, 200, 0.2)",
          },
        },
      },
    }),
    [],
  );

  return (
    <ChartWrapper style={{ height: "100%", width: "100%" }}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta" textColor="neutral800">
          📊 Actividad por Día
        </Typography>
      </Flex>

      <div style={{ height: 300, marginTop: 16 }}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartWrapper>
  );
};
