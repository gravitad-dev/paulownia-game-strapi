/**
 * reward-claim lifecycles
 * Automatically create notifications and send emails when claim status changes
 */

import path from "path";
const emailHelper = require("../../../../helpers/email");

// Status configuration for emails
const STATUS_CONFIG: Record<
  string,
  {
    emailTitle: string;
    headerTitle: string;
    mainMessage: string;
    statusInfoBox: string;
  }
> = {
  pending: {
    emailTitle: "Tu reclamación ha sido recibida",
    headerTitle: "Reclamación Recibida",
    mainMessage: "tu reclamación de premio ha sido recibida correctamente.",
    statusInfoBox: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef6ff;border-radius:8px;">
        <tr>
          <td style="padding:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#1d4ed8;">📄 Próximos pasos</p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#333333;">Por favor, sube los documentos requeridos para que podamos procesar tu reclamación. Recibirás un email cuando tu solicitud sea revisada.</p>
          </td>
        </tr>
      </table>`,
  },
  processing: {
    emailTitle: "Tu reclamación está siendo procesada",
    headerTitle: "Reclamación en Proceso",
    mainMessage:
      "tu reclamación de premio está siendo procesada por nuestro equipo.",
    statusInfoBox: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fffbeb;border-radius:8px;">
        <tr>
          <td style="padding:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#b45309;">⏳ Estado actual</p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#333333;">Nuestro equipo está revisando tu documentación. Te notificaremos cuando haya novedades sobre tu reclamación.</p>
          </td>
        </tr>
      </table>`,
  },
  delivered: {
    emailTitle: "¡Tu premio ha sido aprobado!",
    headerTitle: "¡Premio Aprobado!",
    mainMessage: "tu reclamación de premio ha sido aprobada.",
    statusInfoBox: `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ecfdf5;border-radius:8px;">
        <tr>
          <td style="padding:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#047857;">📬 Próximos pasos</p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#333333;">Nuestro equipo se pondrá en contacto contigo pronto para coordinar la entrega de tu premio. ¡Mantente atento a tu correo!</p>
          </td>
        </tr>
      </table>`,
  },
  rejected: {
    emailTitle: "Actualización sobre tu reclamación",
    headerTitle: "Reclamación Rechazada",
    mainMessage:
      "lamentamos informarte que tu reclamación de premio ha sido rechazada.",
    statusInfoBox: "", // Se construye dinámicamente con el motivo
  },
};

// Build rejection info box with reason
function buildRejectionInfoBox(rejectionReason: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fef2f2;border-radius:8px;margin-bottom:16px;">
      <tr>
        <td style="padding:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#b91c1c;">📋 Motivo del rechazo</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#333333;">${rejectionReason || "No se proporcionó un motivo específico."}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f3ff;border-radius:8px;">
      <tr>
        <td style="padding:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#6d28d9;">💡 ¿Qué puedo hacer?</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#333333;">Puedes intentar realizar una nueva reclamación corrigiendo los problemas indicados. Si crees que hubo un error, contacta a nuestro equipo de soporte.</p>
        </td>
      </tr>
    </table>`;
}

// Send status email
async function sendClaimStatusEmail(claim: any, strapi: any): Promise<void> {
  const config = STATUS_CONFIG[claim.claimStatus];
  if (!config) return;

  // Get user and reward info
  const populated = await strapi.entityService.findOne(
    "api::reward-claim.reward-claim",
    claim.id,
    {
      populate: ["user_reward", "user_reward.reward", "users_permissions_user"],
    },
  );

  const user = populated?.users_permissions_user;
  const rewardName = populated?.user_reward?.reward?.name || "Premio";
  const userEmail = claim.email || user?.email;

  if (!userEmail) {
    strapi.log.warn(
      `Cannot send claim status email: no email for claim ${claim.id}`,
    );
    return;
  }

  const templatesDir = emailHelper.getTemplatesDir();
  const templatePath = path.resolve(
    templatesDir,
    "reward-claim-status-email.html",
  );
  let htmlSource = emailHelper.readTemplate(
    templatePath,
    "<p>Tu reclamación ha sido actualizada.</p>",
  );

  htmlSource = emailHelper.normalizeTemplateImagesToCid(htmlSource);

  // Build status info box (special handling for rejected)
  let statusInfoBox = config.statusInfoBox;
  if (claim.claimStatus === "rejected") {
    statusInfoBox = buildRejectionInfoBox(
      claim.rejectionReason || claim.adminNotes || "",
    );
  }

  const html = emailHelper.applyVariables(htmlSource, {
    emailTitle: config.emailTitle,
    headerTitle: config.headerTitle,
    mainMessage: config.mainMessage,
    statusInfoBox,
    userName: emailHelper.getUserDisplayName(user),
    rewardName,
    claimCode: claim.claimCode || "",
    appName: emailHelper.getAppName(),
    supportEmail: emailHelper.getSupportEmail(),
    year: new Date().getFullYear().toString(),
  });

  const attachments = emailHelper.getLogoAttachments(templatesDir);

  try {
    await emailHelper.sendEmail(strapi, {
      to: userEmail,
      from: process.env.EMAIL_FROM,
      replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM,
      subject: config.emailTitle,
      html,
      attachments,
    });
    strapi.log.info(
      `Claim status email sent to ${userEmail} for claim ${claim.claimCode} (${claim.claimStatus})`,
    );
  } catch (err) {
    strapi.log.error("Failed to send claim status email:", err);
  }
}

module.exports = {
  /**
   * After create: Create notification and send email for new claim
   */
  async afterCreate(event) {
    const { result } = event;
    try {
      // Create in-app notification
      await strapi
        .service("api::notification.notification")
        .createRewardClaimNotification(result);

      // Send email notification
      await sendClaimStatusEmail(result, strapi);
    } catch (error) {
      strapi.log.error("Error in reward-claim afterCreate lifecycle:", error);
    }
  },

  async afterUpdate(event) {
    const { result, params } = event;

    // Only if claimStatus was updated
    if (params.data.claimStatus && result) {
      try {
        // If claim was approved (delivered), update associated user-reward to claimed
        if (result.claimStatus === "delivered") {
          const claim = await strapi.db
            .query("api::reward-claim.reward-claim")
            .findOne({
              where: { id: result.id },
              populate: ["user_reward"],
            });

          if (claim?.user_reward) {
            await strapi.db.query("api::user-reward.user-reward").update({
              where: { id: claim.user_reward.id },
              data: {
                rewardStatus: "claimed",
                claimed: true,
                claimedAt: new Date(),
              },
            });
          }
        }

        // Create in-app notification for status change
        await strapi
          .service("api::notification.notification")
          .createRewardClaimNotification(result);

        // Send email notification for status change
        await sendClaimStatusEmail(result, strapi);
      } catch (error) {
        strapi.log.error("Error in reward-claim lifecycle:", error);
      }
    }
  },
};
