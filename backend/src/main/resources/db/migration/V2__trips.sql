CREATE TABLE trips (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(180) NOT NULL,
    destination VARCHAR(180),
    starts_on DATE,
    ends_on DATE,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    status VARCHAR(16) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'upcoming', 'ongoing', 'completed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);
CREATE INDEX trips_user_dates_idx ON trips (user_id, starts_on, ends_on)
    WHERE deleted_at IS NULL;
