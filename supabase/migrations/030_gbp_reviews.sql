-- 030_gbp_reviews.sql
-- Store Google Business Profile reviews for new-review detection and quick-reply

CREATE TABLE IF NOT EXISTS gbp_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id       TEXT NOT NULL,
  author_name     TEXT,
  is_anonymous    BOOLEAN NOT NULL DEFAULT false,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  create_time     TIMESTAMPTZ NOT NULL,
  update_time     TIMESTAMPTZ,
  reply_comment   TEXT,
  reply_time      TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one row per review per org (enables safe upsert logic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gbp_reviews_org_review
  ON gbp_reviews (org_id, review_id);

-- Fast lookup for unnotified reviews
CREATE INDEX IF NOT EXISTS idx_gbp_reviews_notified
  ON gbp_reviews (org_id, notified_at)
  WHERE notified_at IS NULL;

-- RLS
ALTER TABLE gbp_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gbp_reviews_org" ON gbp_reviews;
CREATE POLICY "gbp_reviews_org" ON gbp_reviews FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
