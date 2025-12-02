/**
 * user-session service
 */

import { factories } from "@strapi/strapi";

// Use 'as any' to bypass TypeScript checks for new content type until types are regenerated
const USER_SESSION_UID = "api::user-session.user-session" as any;

export default factories.createCoreService(USER_SESSION_UID);
