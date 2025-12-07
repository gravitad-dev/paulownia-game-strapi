import { Box, Typography, Flex, Button, Badge } from "@strapi/design-system";
import styled from "styled-components";
import { ArrowRight, User, Calendar } from "@strapi/icons";
import { useNavigate } from "react-router-dom";
import type { PendingClaim } from "../api/stats";

interface PendingClaimsCardProps {
  claims: PendingClaim[];
  loading?: boolean;
}

const CardWrapper = styled(Box)`
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(33, 33, 52, 0.1);
  height: 500px;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const ClaimItem = styled(Box)`
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: 4px;
  margin-bottom: 12px;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary500};
    box-shadow: 0 2px 8px rgba(33, 33, 52, 0.05);
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const ClaimHeader = styled(Flex)`
  margin-bottom: 8px;
`;

const MetaRow = styled(Flex)`
  gap: 16px;
  margin-top: 8px;
`;

const MetaItem = styled(Flex)`
  gap: 6px;
`;

export const PendingClaimsCard = ({
  claims,
  loading,
}: PendingClaimsCardProps) => {
  const navigate = useNavigate();

  const handleReviewClick = (documentId: number) => {
    navigate(
      `/content-manager/collection-types/api::reward-claim.reward-claim/${documentId}`,
    );
  };

  if (loading) {
    return (
      <CardWrapper>
        <Typography variant="beta" textColor="neutral800">
          🎁 Reclamos Pendientes
        </Typography>
        <Box paddingTop={4}>
          <Typography textColor="neutral600">Cargando reclamos...</Typography>
        </Box>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper style={{ width: "100%" }}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="beta" textColor="neutral800">
          🎁 Reclamos Pendientes
        </Typography>
        {claims.length > 0 && <Badge>{claims.length} pendientes</Badge>}
      </Flex>

      <Box style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
        {claims.length === 0 ? (
          <Box
            background="neutral100"
            padding={4}
            hasRadius
            style={{ textAlign: "center" }}
          >
            <Typography textColor="neutral600">
              No hay reclamos pendientes de revisión.
            </Typography>
          </Box>
        ) : (
          claims.map((claim) => (
            <ClaimItem key={claim.documentId}>
              <ClaimHeader
                justifyContent="space-between"
                alignItems="flex-start"
              >
                <Box>
                  <Typography
                    variant="delta"
                    textColor="neutral800"
                    fontWeight="bold"
                    style={{ display: "block" }}
                  >
                    {claim.rewardName}
                  </Typography>
                  <Typography variant="pi" textColor="neutral600">
                    Código: {claim.claimCode}
                  </Typography>
                </Box>
                <Button
                  variant="secondary"
                  size="S"
                  endIcon={<ArrowRight />}
                  onClick={() => handleReviewClick(claim.documentId)}
                >
                  Revisar
                </Button>
              </ClaimHeader>

              {claim.requiresIdentityVerification && (
                <Box marginBottom={2}>
                  <Badge active>Requiere Verificación DNI</Badge>
                </Box>
              )}

              <MetaRow>
                <MetaItem>
                  <User
                    style={{
                      width: "12px",
                      height: "12px",
                      color: "#666687",
                    }}
                  />
                  <Typography variant="pi" textColor="neutral600">
                    {claim.fullName} ({claim.user})
                  </Typography>
                </MetaItem>
                <MetaItem>
                  <Calendar
                    style={{
                      width: "12px",
                      height: "12px",
                      color: "#666687",
                    }}
                  />
                  <Typography variant="pi" textColor="neutral600">
                    {new Date(claim.createdAt).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Typography>
                </MetaItem>
              </MetaRow>
            </ClaimItem>
          ))
        )}
      </Box>
    </CardWrapper>
  );
};
