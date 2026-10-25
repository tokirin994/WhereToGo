ALTER TABLE places ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE places ADD COLUMN visited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE places ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE places ADD COLUMN source_url VARCHAR(1500);
ALTER TABLE trips ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE trip_stops ADD COLUMN estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(estimated_cost >= 0);
ALTER TABLE trip_stops ADD COLUMN completed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE travel_collections (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL, description VARCHAR(500) NOT NULL DEFAULT '',
    color VARCHAR(7) NOT NULL DEFAULT '#4d7c76',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX travel_collections_owner_idx ON travel_collections(user_id) WHERE deleted_at IS NULL;
CREATE TABLE travel_collection_places (
    collection_id UUID NOT NULL REFERENCES travel_collections(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES places(id), PRIMARY KEY(collection_id,place_id)
);
