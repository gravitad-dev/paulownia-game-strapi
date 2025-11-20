# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2025-11-20

#### Added
- **UUID System**: Auto-generation of 24-character alphanumeric UUIDs for all content types
  - Global lifecycle hook (`src/lifecycles/autoUuid.ts`) for automatic UUID generation on record creation
  - Modular helpers: `src/helpers/uuidGenerator.ts` and `src/helpers/uuidApi.ts`
  - Registered lifecycle globally in `src/index.ts`
  
- **UUID-based CRUD Routes** for 12 content types:
  - `GET /api/{content-type}s/uuid/:uuid?populate=*` - Find by UUID (with populate support)
  - `PUT /api/{content-type}s/uuid/:uuid` - Update by UUID
  - `DELETE /api/{content-type}s/uuid/:uuid` - Delete by UUID
  - Applied to: achievements, daily-rewards, levels, log-histories, player-stats, rewards, roulette-histories, user-achievements, user-daily-rewards, user-game-histories, user-rewards, user-transaction-histories
  - 36 new routes total (3 per content type)

- **Postman Collection Updates**:
  - Added UUID operation requests for all 12 content types
  - Each content type now has GET, PUT, DELETE by UUID endpoints
  - Location: `documentation/STRAPI-PAULOWNIA-GAME-API.postman_collection.json`

#### Fixed
- UUID routes now properly support `populate` query parameter
  - Changed implementation to use `strapi.service().findOne()` instead of `strapi.db.query().findOne()`
  - Allows Strapi to correctly process populate parameters like `?populate=*`

#### Technical Details
- **Files Created**: 26 (2 helpers, 1 lifecycle, 12 controllers updated, 12 route files)
- **Architecture**: Modular and reusable pattern using shared helpers
- **UUID Format**: 24 alphanumeric characters (e.g., `WnxL3KNjWbJs9l2X5F0fdEa7`)

