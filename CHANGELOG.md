# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2025-11-24

#### Added - Ownership Guard Middleware

- **Global Authorization Middleware**: Implemented comprehensive ownership-based access control (`src/middlewares/ownership-guard.ts`)
  - **Automatic User Extraction**: Parses JWT tokens from Authorization headers to identify authenticated users
  - **Admin Bypass**: Administrators have unrestricted access to all resources
  - **User Protection**: Blocks unauthorized modification/deletion of user accounts
    - Users can only modify their own profile (`/api/users/:id`)
    - Always allows access to `/api/users/me` endpoint
  - **Resource Ownership Enforcement**: Protects content types with `users_permissions_user` relation
    - **Protected Operations**: PUT, PATCH, DELETE operations require ownership verification
    - **POST Operations**: Automatically assigns `users_permissions_user` to the authenticated user's documentId
    - **Ownership Verification**: Validates both numeric `id` and `documentId` for compatibility
    - **UUID Support**: Full support for UUID-based routes (`/api/{content-type}s/uuid/:uuid`)
  - **Open Read Policy**: Configured read access for specific content types:
    - `player-stats`, `user-game-histories`, `user-achievements`, `user-daily-rewards`, `user-rewards`, `user-transaction-histories`
    - GET requests for these resources are publicly readable
    - Modification/deletion still requires ownership
  - **Smart Query Filtering**: For non-open-read resources, automatically injects ownership filters on GET collection requests
  - **Middleware Registration**: Added to global middleware stack in `config/middlewares.ts` (positioned before session middleware)

#### Added - Ownership Guard Tests

- **Comprehensive Test Suite**: Created Jest test suite for ownership guard middleware (`tests/ownership/ownership.middleware.test.ts`)
  - **16 test cases** covering all authorization scenarios:
    - Non-API routes bypass
    - Unauthenticated user handling
    - Admin privilege bypass
    - User endpoint protection (`/api/users/:id` and `/api/users/me`)
    - Open read policy for public resources
    - Ownership verification for documentId and UUID-based routes
    - POST operation auto-assignment
    - Forbidden access blocking for unauthorized modifications
    - Models without ownership relations (pass-through)
  - **Mock Infrastructure**: Custom Strapi mocks for testing middleware behavior
  - **All Tests Passing**: 16/16 tests passed successfully

#### Changed

- **Player Stats Controller**: Simplified controller to use UUID helper methods (`src/api/player-stat/controllers/player-stat.ts`)
  - Removed custom controller logic in favor of standard `getUuidControllerMethods`
  - Authorization now handled by global ownership guard middleware
- **Postman Collection**: Updated API collection with ownership guard behavior documentation

### 2025-11-22

#### Added - Achievement System

- **Complete Achievement System Implementation**:
  - **TDD Approach**: Implemented using Test-Driven Development with **31 comprehensive tests** covering all scenarios.
  - **Endpoints**:
    - `GET /api/achievements/my-achievements`: Lists all active achievements with user progress.
      - Supports **Filtering**: `status` (locked, completed, claimed), `targetType`, `rewardType`.
      - Supports **Sorting**: `sort` by any field (e.g., `goalAmount:asc`).
      - Supports **Pagination**: `page` and `pageSize`.
      - Returns calculated status (`locked`, `completed`, `claimed`) based on user progress.
    - `POST /api/achievements/claim`: Allows users to claim rewards for completed achievements.
      - Validates achievement existence and completion status.
      - Prevents double claiming.
      - **Transactional**: Updates `player-stat` (coins/tickets) and logs transaction in `user-transaction-history`.
      - **Rollback Mechanism**: Reverts changes if any part of the transaction fails.
  - **Seeder Updates**:
    - Updated `scripts/seed.ts` to create `user-achievements` for all available achievements.
    - Implemented **Sparse Data** simulation (Option A): Regular users have ~30% of achievements initiated to simulate realistic usage.
    - **Gravitad User**: Configured with all achievements created, and "Logro 1" completed/ready to claim for testing.
  - **Documentation**:
    - Updated Postman collection with new endpoints and query parameters.

#### Fixed

- **Achievement Duplication**: Resolved issue where `user-achievements` were linked to duplicate achievement records by enforcing UUID-based lookups.
- **Seeder Logic**: Fixed seeder to create `user-achievement` records for _all_ achievements instead of just the first one.

#### Changed - Daily Rewards

- **24-Hour Cooldown**: Changed claim logic from midnight reset to a strict 24-hour cooldown.
  - `nextClaimDate` is now calculated as `lastClaimedDate + 24 hours`.
- **Cycle Logic**: Disabled automatic cycle restart.
  - After claiming the last day (Day 7), the cycle stops (`nextDay: null`, `canClaim: false`) until the monthly reset.
- **Error Handling**: Added `nextClaimDate` to the `400 Bad Request` response when claiming too early.
  - Fixed edge case: claiming immediately after cycle end returns `cycle_complete` instead of `already_claimed_today`.

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

#### Added - Ranking System

- **New Content Type**: `Ranking` for storing historical player rankings
  - Fields: `timestamp` (datetime), `topPlayers` (JSON), `stats` (JSON)
  - Stores top 100 players with enriched data and global statistics
- **Automated Ranking Generation**:
  - **Cron Job**: Configurable ranking generation in `config/cron-tasks.ts`
    - Default schedule: Every 6 hours (`0 */6 * * *`)
    - Configurable via `CRON_RANKING_SCHEDULE` environment variable:
      - `test`: Runs every minute for testing
      - Numeric value (e.g., `6`): Runs every X hours
      - Custom cron expression (e.g., `"0 0 * * *"`): Uses provided expression
  - **Data Retention Policy**: Automatic cleanup of rankings older than 1 year (365 days)
- **Enriched Ranking Data**:
  - **Top Players** (top 100): rank, username, score, xp, gamesWon, winRate, coins, tickets, country, avatar
  - **Global Statistics**:
    - `totalPlayers`: Total number of players
    - `averageScore`: Average score across all players
    - `mostWins`: Player with most victories
    - `mostGamesPlayed`: Most active player
    - `highestWinRate`: Player with best win percentage
    - `top10Week`: Top 10 players of the current week (highest score in a single game)
    - `top10Month`: Top 10 players of the current month (highest score in a single game)
- **API Endpoint**: `GET /api/rankings`
  - Supports standard Strapi pagination (offset-based and page-based)
  - Sorting and filtering capabilities
- **Postman Collection**: Updated with Ranking endpoint documentation
  - Detailed parameter descriptions
  - Pagination examples (both modes)
  - Complete response schema documentation

#### Added - Seeder System

- **Standalone TypeScript Seeder**: `scripts/seed.ts`
  - Populates database with test data for all content types
  - Preserves `gravitad` admin user during cleanup
  - Generates consistent and realistic test data
- **NPM Scripts**:
  - `npm run seed`: Populate database with test data
  - `npm run seed:clean`: Clean database (except gravitad) and repopulate
- **Dependencies**: Installed `ts-node` for TypeScript script execution
- **Data Consistency**:
  - Fixed `PlayerStats` generation to ensure `gamesWon <= gamesPlayed`
  - Automatic calculation of `gamesLost = gamesPlayed - gamesWon`
  - Prevents invalid winRate calculations (>100%)

#### Fixed

- **WinRate Calculation**: Fixed null handling in ranking generation
  - Calculates winRate on-the-fly if stored value is null: `(gamesWon / gamesPlayed) * 100`
  - Prevents division by zero when `gamesPlayed = 0`
  - Rounds to 2 decimal places for better readability
- **Seeder Data Integrity**: Corrected random data generation to maintain logical consistency between game statistics

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
