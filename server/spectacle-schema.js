export const SPECTACLE_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS auction_rounds (live_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('open','queue_turn','closed')), winner_id TEXT, created_at BIGINT NOT NULL, closed_at BIGINT)`,
 `CREATE TABLE IF NOT EXISTS bids (id TEXT PRIMARY KEY, round_id TEXT NOT NULL, placement_id TEXT NOT NULL, sponsor_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 500 AND amount <= 1000000), status TEXT NOT NULL CHECK(status IN ('pending','leading','outbid','won','refunded','cancelled')), created_at BIGINT NOT NULL)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS one_leading_bid ON bids(round_id) WHERE status='leading'`,
 `CREATE INDEX IF NOT EXISTS bids_sponsor ON bids(sponsor_id,created_at DESC)`,
 `CREATE INDEX IF NOT EXISTS bids_round ON bids(round_id,status,amount DESC)`,
 `CREATE TABLE IF NOT EXISTS activity_events (id TEXT PRIMARY KEY, placement_id TEXT NOT NULL, kind TEXT NOT NULL, ordinal INTEGER, remaining INTEGER, created_at BIGINT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS activity_recent ON activity_events(placement_id,created_at DESC)`,
 `CREATE TABLE IF NOT EXISTS product_events (id TEXT PRIMARY KEY, event TEXT NOT NULL, placement_id TEXT, visitor TEXT, created_at BIGINT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS product_events_time ON product_events(created_at)`,
 `CREATE INDEX IF NOT EXISTS product_events_dedupe ON product_events(visitor,event,placement_id,created_at)`,
 `CREATE TABLE IF NOT EXISTS public_metrics_consent (placement_id TEXT PRIMARY KEY, consented_at BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kill_claims (placement_id TEXT PRIMARY KEY, visitor TEXT NOT NULL, hit_ordinal INTEGER NOT NULL, handle TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, claimed_at BIGINT)`,
 `CREATE INDEX IF NOT EXISTS kill_claims_visitor ON kill_claims(visitor,created_at DESC)`,
 `CREATE INDEX IF NOT EXISTS placements_sponsor_created ON placements(sponsor_id,created_at DESC)`,
 `CREATE INDEX IF NOT EXISTS placements_archive ON placements(ended_at DESC) WHERE status='ended'`
];
export const SPECTACLE_TABLES=['auction_rounds','bids','activity_events','product_events','public_metrics_consent','kill_claims'];
