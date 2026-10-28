CREATE TABLE account_provider_credentials (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    key_id VARCHAR(80) NOT NULL,
    nonce TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, provider)
);
CREATE UNIQUE INDEX one_active_ai_provider ON account_provider_credentials(user_id)
WHERE enabled AND provider <> 'amap';
