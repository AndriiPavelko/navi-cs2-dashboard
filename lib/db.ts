import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

types.setTypeParser(1082, (value) => value);

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL не задано");
  }
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  pool = new Pool({
    connectionString,
    max: 4,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return pool;
}

export async function endPool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  real_name TEXT,
  country TEXT,
  role TEXT,
  is_coach BOOLEAN NOT NULL DEFAULT FALSE,
  join_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  liquipedia_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  played_at TIMESTAMPTZ NOT NULL,
  tournament TEXT NOT NULL,
  section TEXT,
  tier TEXT,
  event_type TEXT,
  best_of INTEGER,
  page_name TEXT,
  opponent_name TEXT NOT NULL,
  opponent_template TEXT,
  navi_score INTEGER,
  opponent_score INTEGER,
  navi_won BOOLEAN,
  finished BOOLEAN NOT NULL,
  navi_players JSONB NOT NULL DEFAULT '[]'::jsonb,
  opponent_players JSONB NOT NULL DEFAULT '[]'::jsonb,
  win_low INTEGER,
  win_high INTEGER,
  win_reasons JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  map_name TEXT NOT NULL,
  navi_score INTEGER,
  opponent_score INTEGER,
  navi_won BOOLEAN,
  vod TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  author TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ,
  tone TEXT NOT NULL CHECK (tone IN ('спокійно', 'зібрано', 'напружено')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  summary JSONB
);

CREATE INDEX IF NOT EXISTS series_played_idx ON series (played_at DESC);
CREATE INDEX IF NOT EXISTS maps_series_idx ON maps (series_id, position);
CREATE INDEX IF NOT EXISTS posts_published_idx ON posts (published_at DESC);

ALTER TABLE series ADD COLUMN IF NOT EXISTS maps_low INTEGER;
ALTER TABLE series ADD COLUMN IF NOT EXISTS maps_high INTEGER;
ALTER TABLE series ADD COLUMN IF NOT EXISTS maps_reasons JSONB;

ALTER TABLE series ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'navi';
ALTER TABLE maps ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'navi';
ALTER TABLE players ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'navi';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'navi';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'series_pkey' AND pg_get_constraintdef(oid) LIKE '%team%'
  ) THEN
    ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_series_id_fkey;
    ALTER TABLE series DROP CONSTRAINT IF EXISTS series_pkey;
    ALTER TABLE series ADD PRIMARY KEY (team, id);
    ALTER TABLE maps ADD CONSTRAINT maps_series_id_fkey
      FOREIGN KEY (team, series_id) REFERENCES series (team, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'players_pkey' AND pg_get_constraintdef(oid) LIKE '%team%'
  ) THEN
    ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;
    ALTER TABLE players ADD PRIMARY KEY (team, id);
  END IF;
END $$;
`;

export async function ensureSchema(client?: PoolClient): Promise<void> {
  if (client) {
    await client.query(SCHEMA);
    return;
  }
  await getPool().query(SCHEMA);
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}
