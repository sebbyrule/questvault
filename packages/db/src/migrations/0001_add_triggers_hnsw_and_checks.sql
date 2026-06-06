-- Custom migration: things drizzle-kit 0.22 cannot express in schema-as-code.
--   1. updated_at auto-touch trigger (AGENT.md + SDD: "kept current via trigger")
--   2. HNSW index on tickets.embedding for semantic search (SDD §4.1)
--   3. CHECK (xp_awarded >= 0) — schema declares check() but drizzle-kit 0.22
--      does not emit it; backfilled idempotently here (SDD §4.1).

-- ── 1. updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users', 'projects', 'sprints', 'tickets', 'comments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I;', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tbl
    );
  END LOOP;
END $$;--> statement-breakpoint

-- ── 2. HNSW index for cosine similarity over ticket embeddings ─────────────
CREATE INDEX IF NOT EXISTS "tickets_embedding_hnsw_idx"
  ON "tickets" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- ── 3. Non-negative XP guard ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "xp_events"
    ADD CONSTRAINT "xp_events_xp_awarded_non_negative" CHECK ("xp_awarded" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
