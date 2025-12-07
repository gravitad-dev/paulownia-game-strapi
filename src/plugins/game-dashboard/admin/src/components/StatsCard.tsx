import { Box, Flex, Typography } from "@strapi/design-system";
import styled from "styled-components";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  subtitle?: string;
}

const CardWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
  flex: 1;
  height: 100%;
`;

const IconWrapper = styled(Box)<{ $color?: string }>`
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $color }) => $color || "#7B79FF"}20;
  color: ${({ $color }) => $color || "#7B79FF"};

  svg {
    width: 24px;
    height: 24px;
  }
`;

const ValueText = styled(Typography)`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.neutral800};
  margin-top: 8px;
  display: block;
  word-break: break-word;
`;

export const StatsCard = ({
  title,
  value,
  icon,
  color,
  subtitle,
}: StatsCardProps) => {
  return (
    <CardWrapper>
      <Flex justifyContent="space-between" alignItems="flex-start">
        <Box style={{ paddingRight: 12 }}>
          <Typography
            variant="pi"
            textColor="neutral600"
            style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}
          >
            {title}
          </Typography>
          <ValueText>
            {value !== undefined && value !== null ? value : "0"}
          </ValueText>
          {subtitle && (
            <Typography
              variant="pi"
              textColor="neutral500"
              style={{ marginTop: 6 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {icon && <IconWrapper $color={color}>{icon}</IconWrapper>}
      </Flex>
    </CardWrapper>
  );
};
