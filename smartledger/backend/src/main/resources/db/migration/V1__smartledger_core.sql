-- SmartLedger owns this database. There are intentionally no foreign keys to WhereToGo.
CREATE TABLE sl_users (
    id UUID PRIMARY KEY,
    issuer VARCHAR(500) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issuer, subject)
);

CREATE TABLE ledger_categories (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    flow_type VARCHAR(10) NOT NULL CHECK (flow_type IN ('expense', 'income')),
    icon VARCHAR(80), color VARCHAR(24), parent_id UUID REFERENCES ledger_categories(id),
    level SMALLINT NOT NULL DEFAULT 0 CHECK (level >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX ledger_categories_user_flow_idx ON ledger_categories(user_id, flow_type, sort_order)
    WHERE deleted_at IS NULL;

CREATE TABLE ledger_books (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    icon VARCHAR(80), color VARCHAR(24), note TEXT,
    book_type VARCHAR(16) NOT NULL DEFAULT 'custom' CHECK (book_type IN ('trip', 'custom', 'general')),
    start_date DATE, end_date DATE,
    auto_collect_enabled BOOLEAN NOT NULL DEFAULT false,
    budget_limit_amount NUMERIC(14,2) CHECK (budget_limit_amount IS NULL OR budget_limit_amount >= 0),
    budget_start_date DATE, budget_end_date DATE,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    -- External reference snapshot. It never points to a row in WhereToGo's database.
    external_app VARCHAR(40), external_trip_id UUID,
    external_trip_name VARCHAR(180), external_destination VARCHAR(180),
    external_trip_starts_on DATE, external_trip_ends_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
    CHECK ((external_app IS NULL AND external_trip_id IS NULL) OR
           (external_app IS NOT NULL AND external_trip_id IS NOT NULL)),
    CHECK (book_type <> 'trip' OR external_trip_id IS NOT NULL)
);
CREATE UNIQUE INDEX ledger_books_external_trip_uq ON ledger_books(user_id, external_app, external_trip_id)
    WHERE deleted_at IS NULL AND external_trip_id IS NOT NULL;
CREATE INDEX ledger_books_user_pinned_idx ON ledger_books(user_id, is_pinned DESC, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE ledger_book_participants (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES ledger_books(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, is_current_user BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(book_id, id)
);
CREATE INDEX ledger_book_participants_book_idx ON ledger_book_participants(book_id, created_at);
CREATE TABLE ledger_book_auto_collect_categories (
    book_id UUID NOT NULL REFERENCES ledger_books(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES ledger_categories(id), PRIMARY KEY(book_id, category_id)
);

CREATE TABLE ledger_transactions (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    title VARCHAR(240) NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK(amount >= 0),
    kind VARCHAR(10) NOT NULL CHECK(kind IN ('expense','income')),
    happened_at TIMESTAMPTZ NOT NULL, note TEXT, merchant VARCHAR(200), payment_method VARCHAR(100),
    source VARCHAR(32) NOT NULL DEFAULT 'manual', currency CHAR(3) NOT NULL DEFAULT 'CNY',
    category_id UUID REFERENCES ledger_categories(id) ON DELETE SET NULL,
    category_name_snapshot VARCHAR(160), installment_group_id UUID,
    installment_index SMALLINT, installment_months SMALLINT, installment_original_total NUMERIC(14,2),
    installment_start_month DATE, original_amount NUMERIC(14,2), discount_amount NUMERIC(14,2),
    premium_amount NUMERIC(14,2),
    offset_source_transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CHECK(installment_months IS NULL OR installment_months >= 2),
    CHECK(installment_index IS NULL OR installment_index >= 1),
    CHECK(discount_amount IS NULL OR discount_amount >= 0), CHECK(premium_amount IS NULL OR premium_amount >= 0)
);
CREATE INDEX ledger_transactions_user_happened_idx ON ledger_transactions(user_id, happened_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX ledger_transactions_installment_idx ON ledger_transactions(installment_group_id, installment_index)
    WHERE deleted_at IS NULL;

CREATE TABLE ledger_transaction_books (
    user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES ledger_books(id) ON DELETE CASCADE,
    payer_participant_id UUID, source VARCHAR(16) NOT NULL DEFAULT 'manual'
        CHECK(source IN ('manual','auto_collect','recommended')),
    include_in_statistics BOOLEAN NOT NULL DEFAULT true, split_enabled BOOLEAN NOT NULL DEFAULT false,
    split_mode VARCHAR(10) NOT NULL DEFAULT 'equal' CHECK(split_mode IN ('equal','ratio','fixed')),
    split_ratio NUMERIC(6,3), split_amount NUMERIC(14,2),
    participant_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb, config_version INTEGER NOT NULL DEFAULT 1,
    needs_review BOOLEAN NOT NULL DEFAULT false, is_split_customized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(transaction_id, book_id),
    FOREIGN KEY(book_id, payer_participant_id) REFERENCES ledger_book_participants(book_id, id)
);
CREATE INDEX ledger_transaction_books_book_idx ON ledger_transaction_books(book_id, transaction_id);
CREATE TABLE ledger_transaction_split_participants (
    transaction_id UUID NOT NULL, book_id UUID NOT NULL, participant_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(transaction_id, book_id, participant_id),
    FOREIGN KEY(transaction_id, book_id) REFERENCES ledger_transaction_books(transaction_id, book_id) ON DELETE CASCADE,
    FOREIGN KEY(book_id, participant_id) REFERENCES ledger_book_participants(book_id, id) ON DELETE CASCADE
);

CREATE TABLE ledger_budgets (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES sl_users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES ledger_books(id) ON DELETE CASCADE, name VARCHAR(160) NOT NULL,
    limit_amount NUMERIC(14,2) NOT NULL CHECK(limit_amount >= 0),
    period_type VARCHAR(12) NOT NULL CHECK(period_type IN ('monthly','range')),
    year SMALLINT, month SMALLINT CHECK(month IS NULL OR month BETWEEN 1 AND 12),
    start_date DATE, end_date DATE, parent_budget_id UUID REFERENCES ledger_budgets(id) ON DELETE CASCADE,
    keyword VARCHAR(100), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ, CHECK(start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX ledger_budgets_user_period_idx ON ledger_budgets(user_id, year, month) WHERE deleted_at IS NULL;
CREATE INDEX ledger_budgets_book_idx ON ledger_budgets(book_id) WHERE deleted_at IS NULL;
CREATE TABLE ledger_budget_categories (
    budget_id UUID NOT NULL REFERENCES ledger_budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES ledger_categories(id) ON DELETE CASCADE, PRIMARY KEY(budget_id, category_id)
);

CREATE TABLE ledger_sync_snapshots (
    user_id UUID PRIMARY KEY REFERENCES sl_users(id) ON DELETE CASCADE,
    schema_version INTEGER NOT NULL, revision BIGINT NOT NULL DEFAULT 1,
    content_hash CHAR(64) NOT NULL, snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ledger_user_settings (
    user_id UUID PRIMARY KEY REFERENCES sl_users(id) ON DELETE CASCADE,
    appearance_mode VARCHAR(10) NOT NULL DEFAULT 'system' CHECK(appearance_mode IN ('system','light','dark')),
    payment_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    book_assignment_prompt_enabled BOOLEAN NOT NULL DEFAULT true,
    cloud_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    cloud_sync_schedule VARCHAR(12) NOT NULL DEFAULT 'on_app_open'
        CHECK(cloud_sync_schedule IN ('on_change','periodic','on_app_open')),
    midnight_sync_enabled BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
