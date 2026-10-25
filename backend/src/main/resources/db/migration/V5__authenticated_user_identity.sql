-- Existing local demo records stay with the demo owner. Production logins never inherit them.
ALTER TABLE users ADD COLUMN issuer VARCHAR(500);
ALTER TABLE users ADD COLUMN subject VARCHAR(255);
ALTER TABLE users ADD CONSTRAINT users_oidc_identity_unique UNIQUE (issuer, subject);
ALTER TABLE users ADD CONSTRAINT users_oidc_identity_pair CHECK ((issuer IS NULL) = (subject IS NULL));
