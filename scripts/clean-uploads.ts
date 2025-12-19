import { createStrapi } from "@strapi/strapi";
import * as dotenv from "dotenv";
import path from "path";

// Cargar variables de entorno manualmente para asegurar que la DB se configure bien
dotenv.config({ path: path.join(process.cwd(), ".env") });

async function cleanUploads() {
  process.env.STRAPI_HIDE_STARTUP_MESSAGE = "true";

  // En Strapi 5, para scripts standalone a veces es necesario indicar el entorno
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

  try {
    const strapi = await createStrapi({
      appDir: process.cwd(),
      distDir: "dist",
    }).load();

    console.log("🚀 Iniciando limpieza de Media Library...");

    const files = await strapi.db.query("plugin::upload.file").findMany({
      select: ["id", "name", "hash", "ext"],
    });

    console.log(`📸 Se han encontrado ${files.length} archivos.`);

    for (const file of files) {
      try {
        // Usar el servicio de upload asegura que se borre de Cloudinary/Local
        await strapi.plugin("upload").service("upload").remove(file);
        console.log(`✅ Borrado: ${file.name}`);
      } catch (err) {
        console.error(`❌ Error borrando ${file.name}:`, err.message);
      }
    }

    console.log("✨ Limpieza completada.");
  } catch (error) {
    console.error("💥 Error general:", error);
    console.log(
      "\n💡 Tip: Asegúrate de que el servidor no esté bloqueando la base de datos.",
    );
  } finally {
    process.exit(0);
  }
}

cleanUploads();
