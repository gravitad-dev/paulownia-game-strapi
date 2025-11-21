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

### 2025-11-21

#### Added
- **Daily Rewards System**:
  - **7-Day Cycle**: Incremental rewards (Coins/Tickets) with automatic reset on day 1 of each month.
  - **New Content Types**: `DailyReward` (definitions) and `UserDailyReward` (tracking).
  - **Player Stats Integration**: Added `tickets`, `ticketsEarned`, `ticketsSpent` to `PlayerStat`.
  - **Transaction History**: Added `daily_reward` type and `currency` field to `UserTransactionHistory`.
  - **Cron Job**: Monthly reset task configured in `config/cron-tasks.ts`.
    - Configurable via environment variables: `CRON_RESET_DAY` (1-31 or 'test') and `CRON_RESET_HOUR` (0-23)
    - Automatic UTC offset calculation for Europe/Madrid timezone
    - Test mode available: `CRON_RESET_DAY='test'` runs reset every minute for testing
  - **Custom Endpoints**:
    - `GET /api/daily-rewards/my-status`: Check reward status.
    - `POST /api/daily-rewards/claim`: Claim next reward.
  - **Automatic Seeding**: Bootstrap logic to create initial 7 rewards if missing.

#### Fixed
- **Permission Issue**: Resolved 403 Forbidden error for custom routes by programmatically inserting missing permissions into the database for the Authenticated role.
- **Null Pointer Exceptions**: Fixed crashes in `myStatus` and `claim` endpoints caused by corrupted `UserDailyReward` records with null `daily_reward` relations. Added global filtering to handle orphaned records gracefully.
- **Reward Logic**: Updated seeding to correctly assign coins for days 1-6 and tickets for day 7.
- **API Response Enhancement**: Both endpoints now return comprehensive 7-day reward status with player stats.

#### Testing
- **Comprehensive Jest Test Suite**: Created exhaustive test coverage for Daily Rewards feature (`tests/daily-reward/daily-reward.controller.test.ts`)
  - **22 test cases** covering all scenarios:
    - Authentication and authorization (unauthorized access)
    - First-time user flow (no claims)
    - Daily claim mechanics (same-day blocking, 24h cooldown)
    - Reward progression (sequential days 1-7)
    - Cycle completion and reset
    - Corrupted data handling (null relations, orphaned records)
    - Player stats updates (coins and tickets)
    - Transaction logging
    - Edge cases (gaps in claims, rollback on transaction failure)
  - **Test Infrastructure**: Custom mocks and factories for Strapi entities
  - **All Tests Passing**: 22/22 tests passed successfully (1.836s runtime)
  - **Dependencies**: Installed and configured Jest for TypeScript testing

