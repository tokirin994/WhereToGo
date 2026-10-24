CREATE TABLE trip_stops (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    place_id UUID REFERENCES places(id),
    day_date DATE NOT NULL,
    place_name VARCHAR(180) NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT '',
    starts_at VARCHAR(5) NOT NULL DEFAULT '09:00',
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    note VARCHAR(500),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trip_stops_trip_day_order_idx ON trip_stops (trip_id, day_date, sort_order);
