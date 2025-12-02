# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### 2025-12-02

#### Added - User Sessions Module

- **New Content Type**: `UserSession` for tracking user login sessions and activity

  - Fields: `startedAt`, `endedAt`, `duration`, `ipAddress`, `userAgent`, `deviceType`, `isActive`
  - Relation: `users_permissions_user` (ManyToOne)
  - Admin-only access: Limited to `find` and `findOne` operations

- **Custom Endpoints**:

  - `GET /api/player-dashboard/session/current`: Get current active session
  - `POST /api/player-dashboard/session/start`: Start new session
  - `POST /api/player-dashboard/session/end`: End current session
  - `GET /api/player-dashboard/session/history`: Get user's session history with pagination

- **Session Management**:

  - Automatic session tracking on user login
  - Device detection (mobile, tablet, desktop)
  - IP address and user agent logging
  - Session duration calculation
  - Active session management (one active session per user)

- **Player Dashboard Integration**:
  - Added `GET /api/player-dashboard/summary`: Complete user stats overview
  - Includes: player stats, achievements, daily rewards, active session, recent activity

#### Security - Admin-Only Routes Restriction

- **Access Control**: Restricted admin routes to prevent unauthorized access
  - `player-stats` routes: Limited to `find` and `findOne` operations only
  - `user-sessions` routes: Limited to `find` and `findOne` operations only
  - Removed CRUD operations: `create`, `update`, `delete` for non-admin users
  - **Permissions Configuration**: Requires Strapi Admin role configuration:
    - Public role: All endpoints disabled
    - Authenticated role: All endpoints disabled
    - Admin role: Only `find` and `findOne` enabled

#### Fixed - Test Suite

- **Reward Controller Tests**: Fixed consumable reward test expectations
  - Updated `rewardStatus` from `"pending"` to `"available"` for consumable rewards
  - Added missing fields: `canBeClaimed: true`, `hasClaim: false`
  - Test now correctly matches actual implementation behavior
  - **Result**: All 125 tests passing successfully

#### Fixed - API Documentation

- **Postman Collection**: Corrected invalid sort field in player-stats endpoint
  - Changed `sort=totalScore:desc` to `sort=score:desc`
  - **Root Cause**: `totalScore` field doesn't exist in player-stat schema
  - **Valid Fields**: `score`, `highestScore`, `xp`, `coins`, `tickets`, `winRate`

### 2025-12-01

#### Changed - Reward Claims API Simplification

- **Endpoint Cleanup**: Removed legacy and redundant endpoints to simplify the API

  - Removed UUID-based routes (`/uuid/:uuid`) - Strapi v5 uses `documentId` natively
  - Removed guardian email confirmation flow (now auto-confirms on document upload)
  - Removed DELETE endpoint (claims managed via cancel/revert workflow)
  - Removed UPDATE endpoint for users (only admins can modify via approve/reject)

- **Final Endpoint Structure** (9 endpoints):
  | Method | Endpoint | Role | Description |
  |--------|----------|------|-------------|
  | GET | `/api/reward-claims` | User/Admin | List claims (users see own, admins see all) |
  | GET | `/api/reward-claims/:id` | User/Admin | Get claim by documentId |
  | POST | `/api/reward-claims` | User | Create new claim |
  | POST | `/api/reward-claims/cancel` | User | Cancel pending/processing claim |
  | POST | `/api/reward-claims/reopen` | User | Create new claim from cancelled/rejected |
  | POST | `/api/reward-claims/upload-documents` | User | Upload identity documents |
  | POST | `/api/reward-claims/approve` | Admin | Approve and mark as delivered |
  | POST | `/api/reward-claims/reject` | Admin | Reject with reason |
  | POST | `/api/reward-claims/revert` | Admin | Undo approved claim (mistake fix) |

#### Added - Revert Endpoint

- **Admin Mistake Recovery**: New `POST /api/reward-claims/revert` endpoint
  - Allows admins to undo accidentally approved claims
  - Reverts `claimStatus` from `delivered` back to `processing`
  - Resets `user_reward.claimed` and `claimedAt`
  - Requires reason for audit trail
  - Admin can then re-approve or reject the claim

#### Removed

- `POST /api/reward-claims/confirm-guardian` - Guardian auto-confirms now
- `POST /api/reward-claims/resend-guardian-email` - No longer needed
- `GET/PUT/DELETE /api/reward-claims/uuid/:uuid` - Use documentId instead
- `DELETE /api/reward-claims/:id` - Use cancel workflow instead
- Helper functions: `generateConfirmationToken`, `hashToken`

### 2025-12-01

#### Added - Reward Claims System

- **New Content Type**: `RewardClaim` for managing consumable reward claims

  - Complete schema with identity verification, guardian support, and claim tracking
  - Fields include: `claimCode`, `fullName`, `email`, `phone`, `address`, `city`, `zipCode`, `country`
  - Identity verification: `birthDate`, `identityDocumentType`, `identityDocumentNumber`
  - Guardian flow: `guardian` relation (auto-confirmed on document upload)
  - Status tracking: 5 states (`pending`, `processing`, `delivered`, `rejected`, `cancelled`)
  - Anti-spam: `verificationAttempts` (max 3)
  - Admin fields: `processedAt`, `processedBy`, `processedByName`, `adminNotes`, `trackingNumber`
  - Consent: `termsAccepted`, `dataProcessingAccepted`, `consentAcceptedAt`
  - Snapshot: `rewardSnapshot` preserves reward data at claim time

- **Status Flow**:

  ```
  pending → processing → delivered
                       ↘ rejected → (reopen) → pending
                       ↘ cancelled → (reopen) → pending
  ```

- **rewardStatus Flow** (on user-reward):
  ```
  available → in_claim → claimed (delivered)
                       → available (rejected/cancelled/reverted)
  ```

#### Changed

- **UserReward Schema**: Added claim tracking fields

  - `canBeClaimed` (boolean): Indicates if reward is eligible for claiming
  - `hasClaim` (boolean): Tracks if claim exists for this reward
  - `claimDeadline` (datetime): Optional deadline for claiming
  - `reward_claim` (relation): OneToOne link to RewardClaim

- **User Schema**: Added `reward_claims` relation (OneToMany)

#### Security

- Ownership validation on all claim endpoints
- Guardian info collected but auto-confirmed (no email verification required)
- Rate limiting on verification attempts (max 3)

#### Documentation

- Updated `REWARD_CLAIMS_BACKEND.md` with complete API documentation
- Updated Postman collection with all 9 endpoints

### 2025-11-28

#### Added

- Custom Endpoint: `POST /api/exchangeCoinsToTickets`
  - Exchange coins for tickets using `Settings.coinsPerTicket` (schema default 1000)
  - Response includes `playerStats`, `ticketsExchanged`, `coinsSpent`, `stats` (week/month/year/total) and `history` (last 10)
  - Transaction logging in `api::user-transaction-history.user-transaction-history` with enums:
    - `transactionType: "coins_to_tickets"`, `currency: "coins"`, `statusTransaction: "completed"`
    - `coinsExchanged`, `amountDelivered`, `executedAt`
  - Exchange limit per period configurable via `Settings`: `exchangeLimitEnabled`, `exchangeLimitTickets`, `exchangeLimitPeriod`. Returns 400 `exchange_limit_reached` when reached.
  - Unlimited option via `Settings.exchangeLimitEnabled=false`. Successful response includes `limit: { unlimited: true }`.
- Custom Endpoint: `GET /api/exchangeCoinsToTickets/status`
  - Exchange status (rate, playerStats, limit and last history)
  - Response:
    - `status`: `{ canExchange, maxTicketsPossible }`
    - `rate`: coins per ticket
    - `playerStats`: `{ coins, tickets }`
    - `limit`: `{ limitTickets, period, ticketsUsed, ticketsRemaining }` or `{ unlimited: true }`
    - `history`: last 10 `coins_to_tickets` transactions
  - Errors: `401 unauthorized`, `400 settings_not_configured` if no published `Settings`

#### Changed

- Postman Collection: added "Exchange Coins→Tickets" request in Player Stats section
- Postman Collection: added "Exchange Status" (GET) request
- Tests: new suite `tests/player-stat/player-stat.exchange.controller.test.ts` with success, error, and rollback cases
  - Added cases for daily/monthly/yearly limits and behavior under the cap
  - Updated tests to handle timezone-aware date calculations
- Configuration migrated to Single Type `Settings` for exchanges (no environment variables):
  - Fields: `coinsPerTicket`, `exchangeLimitEnabled`, `exchangeLimitTickets`, `exchangeLimitPeriod`
  - Controllers read the latest published entry (`publicationState: 'live'`, `locale: 'all'`) and return `400 settings_not_configured` if missing
  - Postman and documentation updated to reflect configuration exclusively from `Settings`
- **Timezone-Aware Exchange Limits**: All exchange limit calculations now use Europe/Madrid timezone
  - Daily limits reset at 00:00 Madrid time (not UTC)
  - Monthly limits reset on day 1 at 00:00 Madrid time
  - Yearly limits reset on January 1 at 00:00 Madrid time
  - Statistics aggregation (week/month/year) also uses Madrid timezone
  - Consistent with daily rewards and ranking system timezone handling
- **Next Reset Date**: Added `nextResetDate` field to exchange responses
  - Included in successful exchange responses when limits are enabled
  - Included in error responses when limit is reached
  - Included in status endpoint (`GET /api/exchangeCoinsToTickets/status`)
  - Returns ISO 8601 date string in UTC indicating when the limit will reset
  - Helps frontend display countdown timers or informative messages to users

#### Fixed

- Roulette History: correctly syncs `reward` and `users_permissions_user` using `documentId` when available.
  - Prevents records with `reward: null` in `roulette-history`.
  - Unified `user-reward` creation to persist with consistent `documentId`.
- Tests: updated to validate history creation without assuming numeric IDs (compatible with `documentId`).
- Spin Ticket Update: made ticket updates atomic when winning ticket rewards.
  - Applies `tickets = tickets - 1 + rewardValue` and increments `ticketsSpent`/`ticketsEarned` in a single update.
  - Avoids inconsistent states caused by multiple sequential updates.

### 2025-11-27

#### Added

- **Timezone Libraries**: Added `date-fns` and `date-fns-tz` to handle Europe/Madrid conversions precisely.

#### Changed

- **Daily Reward Cutoff (Europe/Madrid)**:
  - Refactored `dailyResetHelper` to compute 5:00 AM cutoff using `date-fns-tz`.
  - `getNext5AMMadrid()` and `wasClaimedAfterLast5AM()` now operate in Europe/Madrid and return UTC dates for consistency.
  - Prevents platform-dependent parsing issues and ensures robust same-day blocking.
- **Ranking Cron (Europe/Madrid)**:
  - Weekly (`startOfWeek`) and monthly (`startOfMonth`) periods calculated in Madrid timezone and converted to UTC for DB filters.
  - Retention window (365 days) computed using Madrid timezone and persisted in UTC.
- **Seeder Enhancements**:
  - Updated seed profiles so some users have multiple achievements completed but not yet claimed (ready to test multi-claim UX).

### 2025-11-26

#### Security

- **High Severity Fixes**:
  - **IDOR Prevention**: Restricted access to `user-transaction-history` endpoints. Users can now only access their own transaction history. Admin access remains unrestricted.
  - **Input Validation**: Implemented strict username validation in `users-permissions` extension:
    - Max length: 50 characters.
    - Min length: 3 characters.
    - Allowed characters: Alphanumeric, hyphens, underscores.
    - XSS Prevention: Explicitly rejects dangerous characters (`<`, `>`, `"`, `'`, `&`, etc.) and script patterns.
  - **Business Logic**: Enforced non-negative values for currency fields (`coins`, `tickets`, etc.) in `player-stat` schema and lifecycle hooks.
- **Low Severity Fixes**:
  - **Information Disclosure**: Disabled `X-Powered-By` header to hide server version.

### 2025-11-25

#### Added - Roulette Reward System

- **Probability-Based Roulette System**: Complete implementation of a ticket-based reward system with weighted random selection
  - **Cost**: 1 ticket per spin (no cooldown, limited only by available tickets)
  - **Weighted Probability Algorithm**: Created reusable helper (`src/helpers/probabilityHelper.ts`)
    - Generic `weightedRandomSelection<T>()` function for probability-based item selection
    - Uses cumulative weight distribution for accurate probability matching
  - **Custom Endpoint**: `POST /api/rewards/spin`
    - **Authentication Required**: JWT token validation
    - **Ticket Validation**: Checks user has at least 1 ticket before spinning
    - **Stock Management**: Automatically decrements reward `quantity` after selection
    - **Unique Rewards Logic**: Filters out unique rewards already obtained by user
    - **Comprehensive Error Handling**:
      - 401: Unauthorized (no authentication)
      - 400: Insufficient tickets, no rewards available, all unique rewards obtained, probability selection failed
      - 501: Cosmetic rewards not yet implemented
  - **Reward Type Handling**:
    - **Currency** (`coins`/`tickets`): Applied immediately to `player-stat`, creates `user-reward` with `rewardStatus: 'claimed'`
    - **Consumable** (gift cards): Creates `user-reward` with `rewardStatus: 'pending'` for admin approval
    - **Cosmetic** (avatars, themes): Creates `user-reward` with `rewardStatus: 'available'`, returns 501 (future implementation)
  - **Complete Tracking**:
    - `user-reward` entries created for ALL reward types (consistent with daily-reward pattern)
    - `roulette-history` entry created for every spin
    - `ticketsSpent` incremented on each spin
    - `ticketsEarned` incremented when winning ticket rewards
  - **Response Structure**: Returns `reward` details, `userReward` entry, and updated `playerStats`

#### Changed - Schema Updates

- **roulette-history**: Changed `rewards` relation from `oneToMany` to `manyToOne` (single reward per spin)
- **reward**: Removed inverse `roulette_history` relation (simplified schema)
- **user-reward**: Now uses semantic status values:
  - `claimed`: Currency rewards (automatic)
  - `pending`: Consumables awaiting admin approval
  - `available`: Cosmetics ready to use (future)

#### Added - Seeder Updates

- **Varied Test Rewards**: Updated seeder with 9 realistic rewards for testing (`scripts/seed.ts`)
  - **Currency Rewards (Coins)**: 100 (40%), 500 (25%), 1000 (15%)
  - **Currency Rewards (Tickets)**: 5 (10%), 10 (5%)
  - **Consumables**: Gift Card $10 (3%), Gift Card $50 (1%)
  - **Cosmetics**: Avatar Dorado (0.8%, unique), Tema Oscuro Premium (0.2%, unique)
- **Test User Setup**: `user1` configured with 50 tickets for comprehensive testing

#### Added - Comprehensive Test Suite

- **Jest Unit Tests**: Created extensive test coverage (`tests/reward/reward.controller.test.ts`)
  - **36 test cases** covering all scenarios:
    - Authentication & Validation (6 tests)
    - Currency Rewards - coins and tickets (2 tests)
    - Consumable Rewards (1 test)
    - Cosmetic Rewards - 501 handling (1 test)
    - Unique Rewards Logic (2 tests)
    - Stock Management (2 tests)
    - Probability Selection (2 tests)
  - **Test Infrastructure**:
    - Added `notImplemented` method to `ctx-mock.ts` for 501 responses
    - Mocked `weightedRandomSelection` for deterministic testing
  - **All Tests Passing**: 36/36 tests passed successfully
  - **Coverage**: Authentication, validation, all reward types, stock updates, probability selection, unique rewards filtering

#### Added - Documentation

- **Postman Collection**: Added "Custom Endpoints" section with "Roulette Spin" request
  - Complete endpoint documentation with requirements, cost, response structure
  - Detailed error code descriptions
  - Reward type explanations

#### Fixed

- **Player Stats Tracking**: Added `ticketsSpent` increment when deducting ticket for spin
  - Ensures complete tracking of ticket economy (earned vs spent)
  - Consistent with `coinsEarned`/`coinsSpent` pattern

#### Changed - Daily Rewards Reset System

- **Daily Reset at 5:00 AM Madrid Time**: Changed from 24-hour cooldown to daily reset at fixed time
  - **Previous Behavior**: Claim Day 1 at 14:00 → Day 2 available at 14:00 next day (24h later)
  - **New Behavior**: Claim Day 1 at any time → Day 2 available at 5:00 AM next day
  - **Benefits**:
    - More intuitive: "one day = one calendar day"
    - Consistent with industry standards (mobile games)
    - Incentivizes daily login at consistent times
    - Aligns with monthly reset cron job timezone
  - **Implementation**:
    - Created `dailyResetHelper.ts` with timezone-aware functions:
      - `getNext5AMMadrid()`: Calculates next 5 AM in Madrid timezone
      - `wasClaimedAfterLast5AM()`: Checks if claim was after last 5 AM cutoff
      - `isSameDayMadrid()`: Compares dates in Madrid timezone
    - Updated `myStatus` endpoint to check same-day claims instead of 24h cooldown
    - Updated `claim` endpoint to validate against 5 AM cutoff
    - `nextClaimDate` now returns next 5 AM Madrid time
  - **Test Updates**: All 20 daily-reward tests updated and passing
    - Mocked `dailyResetHelper` for predictable testing
    - Changed time-based assertions from 24h to same-day logic
    - Updated `nextClaimDate` expectations to 5 AM

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
