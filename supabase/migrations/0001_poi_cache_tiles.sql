create table poi_cache_tiles (
    tile_x integer not null,
    tile_y integer not null,
    pois jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (tile_x, tile_y)
);
