-- Reusable routes are independent of dated trips and of single-point places.
CREATE TABLE travel_routes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX travel_routes_owner_idx ON travel_routes(user_id, created_at DESC) WHERE deleted_at IS NULL;
