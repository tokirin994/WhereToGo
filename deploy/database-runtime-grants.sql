-- Run as the migration owner in EACH corresponding database after Flyway migration.
-- Create a separate LOGIN user and grant it the appropriate NOLOGIN role through your provider.
-- Supply the LOGIN password through platform secrets; no passwords belong in this file.

-- WhereToGo database:
-- CREATE ROLE wheretogo_runtime NOLOGIN;
-- GRANT CONNECT ON DATABASE your_database TO wheretogo_runtime;
-- GRANT USAGE ON SCHEMA public TO wheretogo_runtime;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON users, places, tags, place_tags, trips, trip_stops, travel_collections, travel_collection_places TO wheretogo_runtime;
-- GRANT wheretogo_runtime TO your_wheretogo_login;

-- SmartLedger database:
-- CREATE ROLE smartledger_runtime NOLOGIN;
-- GRANT CONNECT ON DATABASE your_database TO smartledger_runtime;
-- GRANT USAGE ON SCHEMA public TO smartledger_runtime;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sl_users, ledger_books, ledger_categories,
--   ledger_book_participants, ledger_book_auto_collect_categories, ledger_transactions,
--   ledger_transaction_books, ledger_transaction_split_participants, ledger_budgets,
--   ledger_budget_categories, ledger_sync_snapshots, ledger_user_settings, ledger_provider_credentials TO smartledger_runtime;
-- GRANT smartledger_runtime TO your_smartledger_login;

-- Set SPRING_DATASOURCE_* to runtime LOGIN credentials.
-- Set SPRING_FLYWAY_URL / SPRING_FLYWAY_USER / SPRING_FLYWAY_PASSWORD to migration credentials.
-- Runtime roles must not receive schema CREATE, table ownership, or provider administration grants.
