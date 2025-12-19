export const mediaCleanup = {
  // Capturamos los datos antes de borrar porque Strapi 5 vacía el objeto 'result' en el afterDelete
  async beforeDelete(event: any) {
    const { model, params } = event;
    const strapi = (global as any).strapi;

    if (
      model.uid === "api::level.level" ||
      model.uid === "plugin::users-permissions.user" ||
      model.uid === "api::reward-claim.reward-claim"
    ) {
      const populate = getPopulateFields(model.uid);

      // Buscamos la entidad con sus imágenes antes de que se borre
      const entity = await strapi.db.query(model.uid).findOne({
        where: params.where,
        populate,
      });

      if (entity) {
        // Guardamos los IDs de las imágenes en el estado del evento para usarlos en afterDelete
        (event as any).state = {
          mediaToDelete: extractMediaIds(entity, model.uid),
        };
      }
    }
  },

  async afterDelete(event: any) {
    const { model, state } = event;
    const strapi = (global as any).strapi;

    if (state?.mediaToDelete && state.mediaToDelete.length > 0) {
      for (const id of state.mediaToDelete) {
        await cleanupMediaIfUnused(strapi, id);
      }
    }
  },

  // Soporte para borrado masivo (Bulk Delete)
  async beforeDeleteMany(event: any) {
    const { model, params } = event;
    const strapi = (global as any).strapi;

    if (
      model.uid === "api::level.level" ||
      model.uid === "plugin::users-permissions.user" ||
      model.uid === "api::reward-claim.reward-claim"
    ) {
      const populate = getPopulateFields(model.uid);

      const entities = await strapi.db.query(model.uid).findMany({
        where: params.where,
        populate,
      });

      const allMediaIds = entities.reduce((acc: any[], entity: any) => {
        return [...acc, ...extractMediaIds(entity, model.uid)];
      }, []);

      if (allMediaIds.length > 0) {
        (event as any).state = { mediaToDelete: [...new Set(allMediaIds)] };
      }
    }
  },

  async afterDeleteMany(event: any) {
    await this.afterDelete(event);
  },
};

function getPopulateFields(uid: string): string[] {
  if (uid === "api::level.level") return ["cover", "puzzleImage"];
  if (uid === "plugin::users-permissions.user") return ["avatar"];
  if (uid === "api::reward-claim.reward-claim")
    return [
      "identityDocumentFront",
      "identityDocumentBack",
      "guardianDocumentFront",
      "guardianDocumentBack",
    ];
  return [];
}

function extractMediaIds(entity: any, uid: string): any[] {
  const ids: any[] = [];

  if (uid === "api::level.level") {
    if (entity.cover) ids.push(entity.cover.id || entity.cover);
    if (entity.puzzleImage) {
      const images = Array.isArray(entity.puzzleImage)
        ? entity.puzzleImage
        : [entity.puzzleImage];
      images.forEach((img: any) => ids.push(img.id || img));
    }
  } else if (uid === "plugin::users-permissions.user") {
    if (entity.avatar) ids.push(entity.avatar.id || entity.avatar);
  } else if (uid === "api::reward-claim.reward-claim") {
    [
      "identityDocumentFront",
      "identityDocumentBack",
      "guardianDocumentFront",
      "guardianDocumentBack",
    ].forEach((field) => {
      if (entity[field]) ids.push(entity[field].id || entity[field]);
    });
  }

  return ids.filter((id) => id != null);
}

async function cleanupMediaIfUnused(strapi: any, fileId: any) {
  try {
    const file = await strapi.db.query("plugin::upload.file").findOne({
      where: { id: fileId },
      populate: ["related"],
    });

    if (file && (!file.related || file.related.length === 0)) {
      await strapi.plugin("upload").service("upload").remove(file);
    }
  } catch (err) {
    strapi.log.error(
      `❌ Error borrando archivo ${fileId} de Cloudinary: ${err.message}`,
    );
  }
}
