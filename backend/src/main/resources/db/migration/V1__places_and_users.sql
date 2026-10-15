CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
    id UUID PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO users (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Local demo user');

CREATE TABLE places (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(180) NOT NULL,
    city VARCHAR(120) NOT NULL,
    address VARCHAR(300),
    category VARCHAR(20) NOT NULL CHECK (category IN ('景点', '美食', '咖啡', '住宿')),
    position geometry(Point, 4326),
    coordinate_system VARCHAR(10) NOT NULL DEFAULT 'WGS84' CHECK (coordinate_system = 'WGS84'),
    coordinate_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (coordinate_status IN ('pending', 'user_confirmed', 'provider_verified')),
    coordinate_source VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX places_user_city_idx ON places (user_id, city) WHERE deleted_at IS NULL;
CREATE INDEX places_position_gist_idx ON places USING GIST (position) WHERE deleted_at IS NULL;

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(40) NOT NULL,
    UNIQUE (user_id, name)
);

CREATE TABLE place_tags (
    place_id UUID NOT NULL REFERENCES places(id),
    tag_id UUID NOT NULL REFERENCES tags(id),
    PRIMARY KEY (place_id, tag_id)
);
