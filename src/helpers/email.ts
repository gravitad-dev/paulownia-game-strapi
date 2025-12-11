import path from "path";
import fs from "fs";

export function getTemplatesDir(): string {
  return process.env.EMAIL_TEMPLATES_DIR || path.resolve(process.cwd(), "templates");
}

export function readTemplate(filePath: string, fallbackHtml: string): string {
  let src = "";
  try {
    src = fs.readFileSync(filePath, "utf8");
  } catch {}
  return src || fallbackHtml;
}

export function normalizeTemplateImagesToCid(html: string): string {
  return String(html).replace(/src=["']\.?\/?[Ll]ogo\.png["']/gi, 'src="cid:logo"');
}

function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyVariables(html: string, vars: Record<string, string>): string {
  let out = String(html);
  for (const key in vars) {
    const val = String(vars[key] ?? "");
    const k = escapeRegExp(key);
    const ku = escapeRegExp(String(key).toUpperCase());
    out = out
      .replace(new RegExp(`<%=\\s*${ku}\\s*%>`, "gi"), val)
      .replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), val)
      .replace(new RegExp(`\\[\\[\\s*${k}\\s*\\]\\]`, "gi"), val);
  }
  return out;
}

export function getLogoAttachments(templatesDir: string): any[] {
  const attachments: any[] = [];
  const logoPath = path.resolve(templatesDir, "Logo.png");
  if (fs.existsSync(logoPath)) attachments.push({ filename: "Logo.png", path: logoPath, cid: "logo" });
  return attachments;
}

export function getUserDisplayName(user: any): string {
  return (
    user?.username ||
    [user?.name, user?.lastname].filter(Boolean).join(" ") ||
    String(user?.email || "").split("@")[0]
  );
}

export function getSupportEmail(): string {
  return process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || "no-reply@example.com";
}

export function getAppName(): string {
  return process.env.APP_NAME || "Paulownia Games";
}

export async function sendEmail(strapi: any, opts: { to: string; from?: string; replyTo?: string; subject: string; html: string; attachments?: any[]; }): Promise<void> {
  try {
    await strapi.plugin("email").service("email").send(opts);
  } catch (err) {
    try { strapi.log.error("email_send_error", err); } catch {}
  }
}
