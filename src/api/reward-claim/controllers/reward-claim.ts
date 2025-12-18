import { factories } from "@strapi/strapi";

const UID = "api::reward-claim.reward-claim" as any;
const USER_REWARD_UID = "api::user-reward.user-reward" as any;
const GUARDIAN_UID = "api::guardiand.guardiand" as any;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Phone validation regex (E.164 format)
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

// Generate unique claim code
const generateClaimCode = (): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `CLAIM-${year}-${random}`;
};

// Calculate age from birthDate
const calculateAge = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

export default factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * Override find to support claimCode filter
   * GET /api/reward-claims?filters[claimCode][$eq]=CLAIM-XXX
   */
  async find(ctx) {
    const user = ctx.state.user;

    // 1. Special handling for claimCode filter (Detailed View)
    const claimCodeFilter = (ctx.query?.filters as any)?.claimCode?.$eq;

    if (claimCodeFilter) {
      if (!user) {
        return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
      }

      const claim: any = await strapi.db.query(UID).findOne({
        where: { claimCode: claimCodeFilter },
        populate: [
          "users_permissions_user",
          "user_reward",
          "user_reward.reward",
          "guardian",
        ],
      });

      if (!claim) {
        return ctx.notFound("Claim not found", { reason: "claim_not_found" });
      }

      // Check ownership (unless admin)
      const isAdmin =
        user.role?.type === "admin" || user.role?.name === "Admin";
      if (!isAdmin && claim.users_permissions_user?.id !== user.id) {
        return ctx.forbidden("This claim does not belong to you", {
          reason: "not_owner",
        });
      }

      return {
        data: {
          id: claim.id,
          uuid: claim.uuid,
          claimCode: claim.claimCode,
          claimStatus: claim.claimStatus,
          fullName: claim.fullName,
          email: claim.email,
          phone: claim.phone,
          address: claim.address,
          city: claim.city,
          zipCode: claim.zipCode,
          country: claim.country,
          additionalNotes: claim.additionalNotes,
          rewardSnapshot: claim.rewardSnapshot,
          trackingNumber: claim.trackingNumber,
          isMinor: claim.isMinor,
          requiresIdentityVerification: claim.requiresIdentityVerification,
          verificationAttempts: claim.verificationAttempts,
          guardianEmailConfirmed: claim.guardianEmailConfirmed,
          rejectionReason: claim.rejectionReason, // Add rejection reason
          adminNotes: claim.adminNotes, // Add admin notes
          createdAt: claim.createdAt,
          processedAt: claim.processedAt,
          userReward: claim.user_reward
            ? {
                uuid: claim.user_reward.uuid,
                obtainedAt: claim.user_reward.obtainedAt,
                reward: claim.user_reward.reward
                  ? {
                      name: claim.user_reward.reward.name,
                      image: claim.user_reward.reward.image,
                    }
                  : null,
              }
            : null,
        },
      };
    }

    // 2. General List View (Security Filter)
    if (user) {
      const isAdmin =
        user.role?.type === "admin" || user.role?.name === "Admin";

      if (!isAdmin) {
        // Force filter by current user
        ctx.query.filters = {
          ...(ctx.query.filters as any),
          users_permissions_user: {
            id: user.id,
          },
        };
      }
    }

    // Ensure guardian is populated in the response
    if (!ctx.query.populate) {
      ctx.query.populate = [
        "users_permissions_user",
        "user_reward",
        "guardian",
      ];
    } else if (ctx.query.populate === "*") {
      // Do nothing, * includes all first-level relations including guardian
    } else if (Array.isArray(ctx.query.populate)) {
      if (!ctx.query.populate.includes("guardian")) {
        ctx.query.populate.push("guardian");
      }
    } else if (typeof ctx.query.populate === "object") {
      // If it's an object (complex populate), we let it be, assuming the caller knows what they want
      // or we could try to merge, but it's safer to leave it if specific fields are requested
    } else if (typeof ctx.query.populate === "string") {
      // If it's a string (e.g. "field1,field2")
      if (!ctx.query.populate.includes("guardian")) {
        ctx.query.populate = `${ctx.query.populate},guardian`;
      }
    }

    // Use default find behavior (supports pagination, sorting, etc.)
    return super.find(ctx);
  } /**
   * Create a new reward claim
   * POST /api/reward-claims
   */,
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { data } = ctx.request.body;
    if (!data) {
      return ctx.badRequest("Missing data", { reason: "missing_data" });
    }

    const {
      userRewardId,
      fullName,
      email,
      phone,
      address,
      city,
      zipCode,
      country,
      additionalNotes,
      termsAccepted,
      dataProcessingAccepted,
    } = data;

    // Validate required fields
    if (!userRewardId || !fullName || !email) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: ["userRewardId", "fullName", "email"],
      });
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return ctx.badRequest("Invalid email format", {
        reason: "invalid_email",
      });
    }

    // Validate phone format if provided
    if (phone && !PHONE_REGEX.test(phone)) {
      return ctx.badRequest("Invalid phone format", {
        reason: "invalid_phone",
      });
    }

    // Validate consent
    if (!termsAccepted || !dataProcessingAccepted) {
      return ctx.badRequest("Consent is required", {
        reason: "consent_required",
      });
    }

    // Find the user-reward by UUID
    const userReward = await strapi.db.query(USER_REWARD_UID).findOne({
      where: { uuid: userRewardId },
      populate: ["reward", "users_permissions_user", "reward_claim"],
    });

    if (!userReward) {
      return ctx.notFound("User reward not found", {
        reason: "user_reward_not_found",
      });
    }

    // Check ownership
    if (userReward.users_permissions_user?.id !== user.id) {
      return ctx.forbidden("This reward does not belong to you", {
        reason: "not_owner",
      });
    }

    // Check if reward is consumable
    if (userReward.reward?.typeReward !== "consumable") {
      return ctx.badRequest("This reward cannot be claimed", {
        reason: "reward_not_claimable",
        rewardType: userReward.reward?.typeReward,
      });
    }

    // Check if reward is available
    if (
      userReward.rewardStatus !== "available" &&
      userReward.rewardStatus !== "pending"
    ) {
      return ctx.badRequest("This reward is not available for claiming", {
        reason: "reward_not_available",
        currentStatus: userReward.rewardStatus,
      });
    }

    // Check if already has a claim
    if (userReward.hasClaim || userReward.reward_claim) {
      const existingClaim = userReward.reward_claim;

      // Allow creating a new claim if the existing one is rejected or cancelled
      // The old claim will be automatically unlinked from the user_reward
      if (
        existingClaim &&
        existingClaim.claimStatus !== "rejected" &&
        existingClaim.claimStatus !== "cancelled"
      ) {
        return ctx.badRequest("This reward has already been claimed", {
          reason: "reward_already_claimed",
          existingClaimCode: existingClaim?.claimCode,
        });
      }
    }

    // Check claim deadline if exists
    if (
      userReward.claimDeadline &&
      new Date(userReward.claimDeadline) < new Date()
    ) {
      return ctx.badRequest("Claim deadline has passed", {
        reason: "claim_deadline_passed",
        deadline: userReward.claimDeadline,
      });
    }

    // Calculate isMinor from user profile if available
    let isMinor = false;
    const fullUser = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        where: { id: user.id },
        select: ["age"],
      });

    if (fullUser && fullUser.age) {
      const age = calculateAge(new Date(fullUser.age));
      isMinor = age < 18;
    }

    // Generate unique claim code
    let claimCode = generateClaimCode();
    let codeExists = true;
    let attempts = 0;
    while (codeExists && attempts < 10) {
      const existing = await strapi.db.query(UID).findOne({
        where: { claimCode },
      });
      if (!existing) {
        codeExists = false;
      } else {
        claimCode = generateClaimCode();
        attempts++;
      }
    }

    // Create reward snapshot
    const rewardSnapshot = {
      name: userReward.reward?.name,
      description: userReward.reward?.description,
      typeReward: userReward.reward?.typeReward,
      quantity: userReward.quantity || 1,
    };

    // Create the claim
    const claim = await strapi.entityService.create(UID, {
      data: {
        claimCode,
        users_permissions_user: user.documentId ?? user.id,
        user_reward: userReward.documentId ?? userReward.id,
        fullName,
        email,
        phone: phone || null,
        address: address || null,
        city: city || null,
        zipCode: zipCode || null,
        country: country || null,
        additionalNotes: additionalNotes || null,
        claimStatus: "pending", // Always start as pending to allow document upload
        isMinor,
        rewardSnapshot,
        verificationAttempts: 0,
        guardianResendCount: 0,
        termsAccepted: true,
        dataProcessingAccepted: true,
        consentAcceptedAt: new Date(),
      } as any,
    });

    // Update user-reward to mark as having a claim and change status to pending
    await strapi.db.query(USER_REWARD_UID).update({
      where: { id: userReward.id },
      data: {
        hasClaim: true,
        rewardStatus: "pending", // Changed from "available" to "pending"
      },
    });

    // Fetch the created claim with relations
    const fullClaim: any = await strapi.entityService.findOne(UID, claim.id, {
      populate: ["user_reward", "users_permissions_user"],
    });

    return {
      data: {
        id: fullClaim.id,
        uuid: fullClaim.uuid,
        claimCode: fullClaim.claimCode,
        claimStatus: fullClaim.claimStatus,
        fullName: fullClaim.fullName,
        email: fullClaim.email,
        phone: fullClaim.phone,
        address: fullClaim.address,
        city: fullClaim.city,
        zipCode: fullClaim.zipCode,
        country: fullClaim.country,
        additionalNotes: fullClaim.additionalNotes,
        rewardSnapshot: fullClaim.rewardSnapshot,
        createdAt: fullClaim.createdAt,
        userReward: {
          uuid: userReward.uuid,
          quantity: userReward.quantity,
          obtainedAt: userReward.obtainedAt,
        },
        user: {
          id: user.id,
          username: user.username,
        },
      },
      message: `Reclamo creado exitosamente. Código de seguimiento: ${claimCode}`,
    };
  },

  /**
   * Cancel a claim (user)
   * POST /api/reward-claims/cancel
   * Body: { claimCode: "CLAIM-XXX" }
   */
  async cancel(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { claimCode } = ctx.request.body;

    const claim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["users_permissions_user", "user_reward"],
    });

    if (!claim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Check ownership
    if (claim.users_permissions_user?.id !== user.id) {
      return ctx.forbidden("This claim does not belong to you", {
        reason: "not_owner",
      });
    }

    // Only allow cancellation if pending or processing
    if (claim.claimStatus !== "pending" && claim.claimStatus !== "processing") {
      return ctx.badRequest("Cannot cancel claim in current status", {
        reason: "invalid_status_for_cancellation",
        currentStatus: claim.claimStatus,
      });
    }

    // Update claim status
    await strapi.db.query(UID).update({
      where: { id: claim.id },
      data: {
        claimStatus: "cancelled",
        adminNotes: claim.adminNotes
          ? `${claim.adminNotes}\n[User Cancelled]`
          : "[User Cancelled]",
      },
    });

    // Update user-reward to allow new claim
    if (claim.user_reward) {
      await strapi.db.query(USER_REWARD_UID).update({
        where: { id: claim.user_reward.id },
        data: {
          hasClaim: false,
          rewardStatus: "available",
        },
      });
    }

    return {
      data: {
        uuid: claim.uuid,
        claimCode: claim.claimCode,
        claimStatus: "cancelled",
      },
      message: "Claim cancelled successfully",
    };
  },

  /**
   * Reopen a cancelled claim
   * POST /api/reward-claims/reopen
   * Body: { claimCode: "CLAIM-XXX", data: {...} }
   */
  async reopen(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { claimCode, data } = ctx.request.body;

    const oldClaim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["users_permissions_user", "user_reward", "user_reward.reward"],
    });

    if (!oldClaim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Check ownership
    if (oldClaim.users_permissions_user?.id !== user.id) {
      return ctx.forbidden("This claim does not belong to you", {
        reason: "not_owner",
      });
    }

    // Only allow reopen if rejected or cancelled
    if (
      oldClaim.claimStatus !== "rejected" &&
      oldClaim.claimStatus !== "cancelled"
    ) {
      return ctx.badRequest("Can only reopen rejected/cancelled claims", {
        reason: "claim_not_rejected",
        currentStatus: oldClaim.claimStatus,
      });
    }

    // Check if user-reward exists
    const userReward = oldClaim.user_reward;
    if (!userReward) {
      return ctx.badRequest("User reward not found", {
        reason: "user_reward_not_found",
      });
    }

    // Check if there's already an active claim (pending/processing) for this reward
    const activeClaim = await strapi.db.query(UID).findOne({
      where: {
        user_reward: userReward.id,
        claimStatus: { $in: ["pending", "processing"] },
      },
    });

    if (activeClaim) {
      return ctx.badRequest("An active claim already exists for this reward", {
        reason: "active_claim_exists",
        activeClaimCode: activeClaim.claimCode,
      });
    }

    // Check claim deadline if exists
    if (
      userReward.claimDeadline &&
      new Date(userReward.claimDeadline) < new Date()
    ) {
      return ctx.badRequest("Claim deadline has passed", {
        reason: "claim_deadline_passed",
        deadline: userReward.claimDeadline,
      });
    }

    // Create new claim with provided data or old data
    const newClaimData = {
      fullName: data?.fullName || oldClaim.fullName,
      email: data?.email || oldClaim.email,
      phone: data?.phone || oldClaim.phone,
      address: data?.address || oldClaim.address,
      city: data?.city || oldClaim.city,
      zipCode: data?.zipCode || oldClaim.zipCode,
      country: data?.country || oldClaim.country,
      additionalNotes: data?.additionalNotes || oldClaim.additionalNotes,
    };

    // Validate email if provided
    if (newClaimData.email && !EMAIL_REGEX.test(newClaimData.email)) {
      return ctx.badRequest("Invalid email format", {
        reason: "invalid_email",
      });
    }

    // Generate new claim code
    let newClaimCode = generateClaimCode();
    let codeExists = true;
    let attempts = 0;
    while (codeExists && attempts < 10) {
      const existing = await strapi.db.query(UID).findOne({
        where: { claimCode: newClaimCode },
      });
      if (!existing) {
        codeExists = false;
      } else {
        newClaimCode = generateClaimCode();
        attempts++;
      }
    }

    // Create new claim
    const newClaim: any = await strapi.entityService.create(UID, {
      data: {
        claimCode: newClaimCode,
        users_permissions_user: user.documentId ?? user.id,
        user_reward: userReward.documentId ?? userReward.id,
        ...newClaimData,
        claimStatus: "pending",
        rewardSnapshot: oldClaim.rewardSnapshot,
        verificationAttempts: 0,
        guardianResendCount: 0,
        termsAccepted: true,
        dataProcessingAccepted: true,
        consentAcceptedAt: new Date(),
      } as any,
    });

    // Update user-reward
    await strapi.db.query(USER_REWARD_UID).update({
      where: { id: userReward.id },
      data: {
        hasClaim: true,
        rewardStatus: "pending",
      },
    });

    return {
      data: {
        uuid: newClaim.uuid,
        claimCode: newClaim.claimCode,
        claimStatus: newClaim.claimStatus,
        fullName: newClaim.fullName,
        createdAt: newClaim.createdAt,
      },
      message: "Nuevo reclamo creado exitosamente",
    };
  },

  /**
   * Upload identity documents
   * POST /api/reward-claims/upload-documents
   * Body: { claimCode: "CLAIM-XXX", ... }
   */
  async uploadDocuments(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    const { claimCode } = ctx.request.body;

    const claim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["users_permissions_user", "user_reward"],
    });

    if (!claim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Check ownership
    if (claim.users_permissions_user?.id !== user.id) {
      return ctx.forbidden("This claim does not belong to you", {
        reason: "not_owner",
      });
    }

    // Check max verification attempts
    if (claim.verificationAttempts >= 3) {
      return (
        ctx.tooManyRequests?.("Maximum verification attempts exceeded", {
          reason: "max_verification_attempts",
          attempts: claim.verificationAttempts,
          maxAttempts: 3,
        }) ??
        ctx.badRequest("Maximum verification attempts exceeded", {
          reason: "max_verification_attempts",
          attempts: claim.verificationAttempts,
          maxAttempts: 3,
        })
      );
    }

    // Only allow upload for pending status
    if (claim.claimStatus !== "pending") {
      return ctx.badRequest("Cannot upload documents in current status", {
        reason: "invalid_status_for_upload",
        currentStatus: claim.claimStatus,
      });
    }

    const { body, files } = ctx.request;

    const {
      identityDocumentType,
      identityDocumentNumber,
      birthDate,
      guardianId,
      guardianData,
    } = body;

    // Validate required fields
    if (!identityDocumentType || !identityDocumentNumber || !birthDate) {
      return ctx.badRequest("Missing required fields", {
        reason: "missing_required_fields",
        required: [
          "identityDocumentType",
          "identityDocumentNumber",
          "birthDate",
        ],
      });
    }

    // Calculate age from the provided birthDate
    const docAge = calculateAge(new Date(birthDate));
    const docIsMinor = docAge < 18;

    // Determine isMinor status
    // We default to the claim's current status to preserve the "Minor" intent.
    // If the claim is for a minor, the uploaded document is expected to be the Guardian's (Adult),
    // so we should NOT switch isMinor to false just because the doc is from an adult.
    let isMinor = claim.isMinor;

    // However, if the claim was marked as Adult but the uploaded doc is from a Minor,
    // we force it to Minor to ensure protection.
    if (!claim.isMinor && docIsMinor) {
      isMinor = true;
    }

    let guardianRecord = null;
    let guardianConfirmationToken = null;

    // Handle minor flow
    if (isMinor) {
      if (!guardianId && !guardianData) {
        strapi.log.warn(
          `[RewardClaim] Missing guardian info for minor claim ${claimCode}`,
        );
        return ctx.badRequest("Guardian information required for minors", {
          reason: "guardian_required",
        });
      }

      if (guardianId) {
        // Find existing guardian
        guardianRecord = await strapi.db.query(GUARDIAN_UID).findOne({
          where: {
            $or: [{ uuid: guardianId }, { documentId: guardianId }],
          },
          populate: ["user"],
        });

        if (!guardianRecord) {
          return ctx.notFound("Guardian not found", {
            reason: "guardian_not_found",
          });
        }

        // Verify guardian belongs to user
        if (guardianRecord.user?.id !== user.id) {
          return ctx.forbidden("Guardian does not belong to you", {
            reason: "guardian_not_owner",
          });
        }
      } else if (guardianData) {
        // Create new guardian
        const parsedGuardianData =
          typeof guardianData === "string"
            ? JSON.parse(guardianData)
            : guardianData;

        // Validate guardian email is different from minor's
        if (parsedGuardianData.email === claim.email) {
          return ctx.badRequest(
            "Guardian email must be different from claim email",
            {
              reason: "same_email_as_minor",
            },
          );
        }

        // Check if DNI already exists
        const existingGuardian = await strapi.db.query(GUARDIAN_UID).findOne({
          where: { DNI: parsedGuardianData.DNI },
        });

        if (existingGuardian) {
          return ctx.badRequest("Guardian with this DNI already exists", {
            reason: "guardian_dni_exists",
          });
        }

        // Create guardian
        guardianRecord = await strapi.entityService.create(GUARDIAN_UID, {
          data: {
            ...parsedGuardianData,
            user: user.documentId ?? user.id,
          } as any,
        });
      }

      // Generate confirmation token - REMOVED (Simplified flow)
      // We now assume guardian consent is implied by providing their data/documents
    }

    // Update claim data first
    const updateData: any = {
      identityDocumentType,
      identityDocumentNumber,
      birthDate,
      isMinor,
      requiresIdentityVerification: true,
      verificationAttempts: claim.verificationAttempts + 1,
      claimStatus: "processing", // Always move to processing after upload
    };

    if (guardianRecord) {
      updateData.guardian = guardianRecord.id;
      updateData.guardianEmailConfirmed = true; // Auto-confirm
      updateData.guardianEmailConfirmedAt = new Date();
    }

    try {
      // 1. Update the entity data
      await strapi.entityService.update(UID, claim.id, {
        data: updateData,
      });

      // 2. Handle file uploads using the Upload plugin service
      if (files) {
        const uploadService = strapi.plugin("upload").service("upload");

        if (files.identityDocumentFront) {
          await uploadService.upload({
            data: {
              refId: claim.id,
              ref: UID,
              field: "identityDocumentFront",
            },
            files: files.identityDocumentFront,
          });
        }

        if (files.identityDocumentBack) {
          await uploadService.upload({
            data: {
              refId: claim.id,
              ref: UID,
              field: "identityDocumentBack",
            },
            files: files.identityDocumentBack,
          });
        }

        // Guardian documents (only for minors)
        if (files.guardianDocumentFront) {
          await uploadService.upload({
            data: {
              refId: claim.id,
              ref: UID,
              field: "guardianDocumentFront",
            },
            files: files.guardianDocumentFront,
          });
        }

        if (files.guardianDocumentBack) {
          await uploadService.upload({
            data: {
              refId: claim.id,
              ref: UID,
              field: "guardianDocumentBack",
            },
            files: files.guardianDocumentBack,
          });
        }
      }

      // 3. Update user_reward status to reflect active claim
      if (claim.user_reward) {
        await strapi.db.query(USER_REWARD_UID).update({
          where: { id: claim.user_reward.id },
          data: { rewardStatus: "in_claim" },
        });
      }
    } catch (error) {
      strapi.log.error(`[RewardClaim] Error updating claim: ${error}`);
      strapi.log.error(JSON.stringify(error, null, 2));
      throw error;
    }

    return {
      data: {
        claimCode: claim.claimCode,
        claimStatus: updateData.claimStatus,
        requiresIdentityVerification: true,
        isMinor,
        verificationAttempts: updateData.verificationAttempts,
        guardian: guardianRecord
          ? {
              id: guardianRecord.id,
              uuid: guardianRecord.uuid,
              name: guardianRecord.name,
              lastName: guardianRecord.lastName,
              email: guardianRecord.email,
              confirmationSent: isMinor,
            }
          : null,
        documentsUploaded: {
          identityDocumentFront: files && !!files.identityDocumentFront,
          identityDocumentBack: files && !!files.identityDocumentBack,
          guardianDocumentFront: files && !!files.guardianDocumentFront,
          guardianDocumentBack: files && !!files.guardianDocumentBack,
        },
        message: "Documentos recibidos. En espera de verificación.",
      },
    };
  },

  /**
   * Approve a claim (admin only)
   * POST /api/reward-claims/approve
   * Body: { claimCode: "CLAIM-XXX", trackingNumber?: "xxx", adminNotes?: "xxx" }
   */
  async approve(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    // Check if admin
    const isAdmin = user.role?.type === "admin" || user.role?.name === "Admin";
    if (!isAdmin) {
      return ctx.forbidden("Only admins can approve claims", {
        reason: "not_admin",
      });
    }

    const { claimCode, trackingNumber, adminNotes } = ctx.request.body;

    if (!claimCode) {
      return ctx.badRequest("Claim code is required", {
        reason: "missing_claim_code",
      });
    }

    const claim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["user_reward", "users_permissions_user"],
    });

    if (!claim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Only allow approval if processing
    if (claim.claimStatus !== "processing") {
      return ctx.badRequest("Can only approve claims in processing status", {
        reason: "invalid_status",
        currentStatus: claim.claimStatus,
      });
    }

    // Update claim
    await strapi.db.query(UID).update({
      where: { id: claim.id },
      data: {
        claimStatus: "delivered",
        processedAt: new Date(),
        processedBy: user.documentId ?? user.id,
        processedByName: user.username || user.email,
        trackingNumber: trackingNumber || null,
        adminNotes: adminNotes
          ? claim.adminNotes
            ? `${claim.adminNotes}\n${adminNotes}`
            : adminNotes
          : claim.adminNotes,
      },
    });

    // Update user_reward status to claimed
    if (claim.user_reward) {
      await strapi.db.query(USER_REWARD_UID).update({
        where: { id: claim.user_reward.id },
        data: {
          rewardStatus: "claimed",
          claimed: true,
          claimedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      message: "Reclamo aprobado exitosamente",
      data: {
        claimCode: claim.claimCode,
        claimStatus: "delivered",
        processedAt: new Date().toISOString(),
        trackingNumber: trackingNumber || null,
      },
    };
  },

  /**
   * Reject a claim (admin only)
   * POST /api/reward-claims/reject
   * Body: { claimCode: "CLAIM-XXX", reason: "xxx" }
   */
  async reject(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    // Check if admin
    const isAdmin = user.role?.type === "admin" || user.role?.name === "Admin";
    if (!isAdmin) {
      return ctx.forbidden("Only admins can reject claims", {
        reason: "not_admin",
      });
    }

    const { claimCode, reason } = ctx.request.body;

    if (!claimCode) {
      return ctx.badRequest("Claim code is required", {
        reason: "missing_claim_code",
      });
    }

    if (!reason) {
      return ctx.badRequest("Rejection reason is required", {
        reason: "missing_reason",
      });
    }

    const claim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["user_reward", "users_permissions_user"],
    });

    if (!claim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Only allow rejection if pending or processing
    if (claim.claimStatus !== "pending" && claim.claimStatus !== "processing") {
      return ctx.badRequest(
        "Can only reject claims in pending or processing status",
        {
          reason: "invalid_status",
          currentStatus: claim.claimStatus,
        },
      );
    }

    // Update claim
    await strapi.db.query(UID).update({
      where: { id: claim.id },
      data: {
        claimStatus: "rejected",
        processedAt: new Date(),
        processedBy: user.documentId ?? user.id,
        processedByName: user.username || user.email,
        adminNotes: claim.adminNotes
          ? `${claim.adminNotes}\n[Rejected: ${reason}]`
          : `[Rejected: ${reason}]`,
      },
    });

    // Update user_reward - keep hasClaim=true so frontend knows there's a rejected claim
    // rewardStatus stays as "available" so user can reopen/create new claim
    if (claim.user_reward) {
      await strapi.db.query(USER_REWARD_UID).update({
        where: { id: claim.user_reward.id },
        data: {
          rewardStatus: "available",
          // hasClaim stays true - frontend should check claim status
        },
      });
    }

    return {
      success: true,
      message: "Reclamo rechazado",
      data: {
        claimCode: claim.claimCode,
        claimStatus: "rejected",
        processedAt: new Date().toISOString(),
        reason: reason,
      },
    };
  },

  /**
   * Revert a delivered claim (admin only)
   * POST /api/reward-claims/revert
   * Body: { claimCode: "CLAIM-XXX", reason: "xxx" }
   */
  async revert(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("Unauthorized", { reason: "unauthorized" });
    }

    // Check if admin
    const isAdmin = user.role?.type === "admin" || user.role?.name === "Admin";
    if (!isAdmin) {
      return ctx.forbidden("Only admins can revert claims", {
        reason: "not_admin",
      });
    }

    const { claimCode, reason } = ctx.request.body;

    if (!claimCode) {
      return ctx.badRequest("Claim code is required", {
        reason: "missing_claim_code",
      });
    }

    if (!reason) {
      return ctx.badRequest("Revert reason is required", {
        reason: "missing_reason",
      });
    }

    const claim = await strapi.db.query(UID).findOne({
      where: { claimCode },
      populate: ["user_reward", "users_permissions_user"],
    });

    if (!claim) {
      return ctx.notFound("Claim not found", { reason: "claim_not_found" });
    }

    // Only allow revert if delivered
    if (claim.claimStatus !== "delivered") {
      return ctx.badRequest("Can only revert claims in delivered status", {
        reason: "invalid_status",
        currentStatus: claim.claimStatus,
      });
    }

    // Update claim - revert to processing so admin can re-approve or reject
    await strapi.db.query(UID).update({
      where: { id: claim.id },
      data: {
        claimStatus: "processing",
        adminNotes: claim.adminNotes
          ? `${claim.adminNotes}\n[Reverted by ${user.username || user.email}: ${reason}]`
          : `[Reverted by ${user.username || user.email}: ${reason}]`,
      },
    });

    // Reset user_reward status back to in_claim
    if (claim.user_reward) {
      await strapi.db.query(USER_REWARD_UID).update({
        where: { id: claim.user_reward.id },
        data: {
          rewardStatus: "in_claim",
          claimed: false,
          claimedAt: null,
        },
      });
    }

    return {
      success: true,
      message: "Reclamo revertido a estado 'processing'",
      data: {
        claimCode: claim.claimCode,
        previousStatus: "delivered",
        claimStatus: "processing",
        revertedAt: new Date().toISOString(),
        revertedBy: user.username || user.email,
        reason: reason,
      },
    };
  },
}));
