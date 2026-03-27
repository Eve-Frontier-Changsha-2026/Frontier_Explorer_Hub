import type Database from 'better-sqlite3';

export function initSchema(db: Database.Database): void {
  db.exec(`
    -- ── On-chain event mirrors ─────────────────────────────────

    CREATE TABLE IF NOT EXISTS intel_reports (
      intel_id       TEXT PRIMARY KEY,
      reporter       TEXT NOT NULL,
      region_id      INTEGER NOT NULL,
      sector_x       INTEGER NOT NULL,
      sector_y       INTEGER NOT NULL,
      sector_z       INTEGER NOT NULL,
      zoom_level     INTEGER NOT NULL,
      raw_location_hash TEXT,
      intel_type     INTEGER NOT NULL,
      severity       INTEGER NOT NULL,
      timestamp      INTEGER NOT NULL,
      expiry         INTEGER NOT NULL,
      visibility     INTEGER NOT NULL DEFAULT 0,
      deposit_amount INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_intel_region_zoom
      ON intel_reports(region_id, zoom_level);
    CREATE INDEX IF NOT EXISTS idx_intel_timestamp
      ON intel_reports(timestamp);
    CREATE INDEX IF NOT EXISTS idx_intel_expiry
      ON intel_reports(expiry);
    CREATE INDEX IF NOT EXISTS idx_intel_reporter
      ON intel_reports(reporter);

    CREATE TABLE IF NOT EXISTS subscriptions (
      subscription_id TEXT PRIMARY KEY,
      subscriber      TEXT NOT NULL,
      tier            INTEGER NOT NULL DEFAULT 0,
      started_at      INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_sub_subscriber
      ON subscriptions(subscriber);

    CREATE TABLE IF NOT EXISTS unlock_receipts (
      receipt_id  TEXT PRIMARY KEY,
      buyer       TEXT NOT NULL,
      intel_id    TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      price_paid  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_unlock_buyer
      ON unlock_receipts(buyer);
    CREATE INDEX IF NOT EXISTS idx_unlock_intel
      ON unlock_receipts(intel_id);

    -- ── Bounty proof/dispute ─────────────────────────────────────

    CREATE TABLE IF NOT EXISTS bounties (
      bounty_id          TEXT PRIMARY KEY,
      meta_id            TEXT NOT NULL,
      creator            TEXT NOT NULL,
      region_id          INTEGER NOT NULL,
      sector_x           INTEGER NOT NULL,
      sector_y           INTEGER NOT NULL,
      sector_z           INTEGER NOT NULL,
      intel_types_wanted TEXT NOT NULL,
      reward_amount      INTEGER NOT NULL,
      deadline           INTEGER NOT NULL,
      status             INTEGER NOT NULL DEFAULT 0,
      submission_count   INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bounty_creator
      ON bounties(creator);
    CREATE INDEX IF NOT EXISTS idx_bounty_status_deadline
      ON bounties(status, deadline);

    CREATE TABLE IF NOT EXISTS bounty_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bounty_id   TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      hunter      TEXT NOT NULL,
      actor       TEXT,
      detail      TEXT,
      timestamp   INTEGER NOT NULL,
      tx_digest   TEXT NOT NULL,
      FOREIGN KEY (bounty_id) REFERENCES bounties(bounty_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bounty_events_timeline
      ON bounty_events(bounty_id, timestamp ASC);

    -- ── Indexer state ──────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS event_cursor (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      cursor_tx  TEXT,
      cursor_event INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    INSERT OR IGNORE INTO event_cursor (id, cursor_tx, cursor_event, updated_at)
      VALUES (1, NULL, NULL, unixepoch() * 1000);

    CREATE TABLE IF NOT EXISTS event_cursors (
      package_key  TEXT PRIMARY KEY,
      cursor_tx    TEXT,
      cursor_event INTEGER,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- ── Aggregation ────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS heatmap_cache (
      cell_key         TEXT PRIMARY KEY,
      zoom_level       INTEGER NOT NULL,
      region_id        INTEGER NOT NULL,
      sector_x         INTEGER NOT NULL,
      sector_y         INTEGER NOT NULL,
      sector_z         INTEGER NOT NULL,
      total_reports    INTEGER NOT NULL DEFAULT 0,
      reporter_count   INTEGER NOT NULL DEFAULT 0,
      suppressed       INTEGER NOT NULL DEFAULT 0,
      by_type_json     TEXT,
      avg_severity     REAL,
      latest_timestamp INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_heatmap_zoom
      ON heatmap_cache(zoom_level);
    CREATE INDEX IF NOT EXISTS idx_heatmap_region
      ON heatmap_cache(region_id, zoom_level);

    CREATE TABLE IF NOT EXISTS aggregation_anchors (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      merkle_root   TEXT NOT NULL,
      report_count  INTEGER NOT NULL,
      zoom_level    INTEGER NOT NULL,
      timestamp     INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- ── EVE EYES integration ──────────────────────────────────

    CREATE TABLE IF NOT EXISTS region_activity (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      region_id       INTEGER,
      defense_index   REAL NOT NULL DEFAULT 0,
      infra_index     REAL NOT NULL DEFAULT 0,
      traffic_index   REAL NOT NULL DEFAULT 0,
      active_players  INTEGER NOT NULL DEFAULT 0,
      window_start    INTEGER NOT NULL,
      window_end      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_region
      ON region_activity(region_id);
    CREATE INDEX IF NOT EXISTS idx_activity_window
      ON region_activity(window_end);

    DROP TABLE IF EXISTS characters;
    CREATE TABLE IF NOT EXISTS characters (
      address            TEXT PRIMARY KEY,
      name               TEXT,
      character_object_id TEXT,
      profile_object_id  TEXT,
      tribe_id           INTEGER,
      item_id            TEXT,
      tenant             TEXT,
      description        TEXT,
      avatar_url         TEXT,
      resolved_at        INTEGER NOT NULL,
      cache_ttl          INTEGER NOT NULL DEFAULT 86400000
    );

    CREATE TABLE IF NOT EXISTS eve_systems (
      object_id      TEXT PRIMARY KEY,
      object_type    TEXT NOT NULL,
      x              REAL NOT NULL,
      y              REAL NOT NULL,
      z              REAL NOT NULL,
      name           TEXT,
      created_by_tx  TEXT NOT NULL,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- ── Utopia integration ───────────────────────────────────────

    CREATE TABLE IF NOT EXISTS utopia_killmails (
      id              TEXT PRIMARY KEY,
      killer_id       TEXT NOT NULL,
      killer_name     TEXT NOT NULL,
      victim_id       TEXT NOT NULL,
      victim_name     TEXT NOT NULL,
      reporter_id     TEXT NOT NULL,
      reporter_name   TEXT NOT NULL,
      loss_type       TEXT NOT NULL,
      solar_system_id INTEGER NOT NULL,
      killed_at       INTEGER NOT NULL,
      shard           INTEGER NOT NULL DEFAULT 1,
      fetched_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_killmails_killed_at
      ON utopia_killmails(killed_at);

    CREATE TABLE IF NOT EXISTS utopia_characters (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      address      TEXT NOT NULL,
      tribe_id     INTEGER,
      tribe_name   TEXT,
      tribe_ticker TEXT,
      created_at   INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utopia_assemblies (
      id          TEXT PRIMARY KEY,
      state       TEXT NOT NULL,
      owner_id    TEXT NOT NULL,
      owner_name  TEXT NOT NULL,
      name        TEXT,
      type_id     INTEGER NOT NULL,
      anchored_at INTEGER NOT NULL,
      fetched_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_utopia_assemblies_state
      ON utopia_assemblies(state);

    CREATE TABLE IF NOT EXISTS utopia_tribes (
      id           INTEGER PRIMARY KEY,
      name         TEXT NOT NULL,
      name_short   TEXT NOT NULL,
      description  TEXT,
      member_count INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_status_cache (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      status_json TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);
}
