-- Credentials are encrypted by the application; keys are supplied outside this database.
CREATE TABLE ledger_provider_credentials (
    user_id UUID PRIMARY KEY REFERENCES sl_users(id) ON DELETE CASCADE,
    key_id VARCHAR(80) NOT NULL,
    nonce VARCHAR(32) NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
