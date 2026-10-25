-- Applied after the APIs finish their owner-only Flyway migrations.
-- Runtime roles have no schema CREATE, no table ownership and no migration-history access.
\connect travelatlas
GRANT SELECT, INSERT, UPDATE, DELETE ON users, places, tags, place_tags,
  trips, trip_stops, travel_collections, travel_collection_places TO travel_app;
\connect smartledger
GRANT SELECT, INSERT, UPDATE, DELETE ON sl_users, ledger_books, ledger_categories,
  ledger_book_participants, ledger_book_auto_collect_categories, ledger_transactions,
  ledger_transaction_books, ledger_transaction_split_participants, ledger_budgets,
  ledger_budget_categories, ledger_sync_snapshots, ledger_user_settings,
  ledger_provider_credentials TO ledger_app;
