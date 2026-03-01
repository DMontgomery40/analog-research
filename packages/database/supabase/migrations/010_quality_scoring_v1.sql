-- Quality heuristics v1: human/agent/bounty legitimacy scores.

ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS human_legitimacy_score NUMERIC(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS human_legitimacy_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS human_legitimacy_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS agent_legitimacy_score NUMERIC(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS agent_legitimacy_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_legitimacy_version TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS bounty_legitimacy_score NUMERIC(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS bounty_legitimacy_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounty_legitimacy_version TEXT NOT NULL DEFAULT 'v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'humans_legitimacy_score_range_ck'
  ) THEN
    ALTER TABLE humans
      ADD CONSTRAINT humans_legitimacy_score_range_ck
      CHECK (human_legitimacy_score >= 0 AND human_legitimacy_score <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'humans_legitimacy_confidence_range_ck'
  ) THEN
    ALTER TABLE humans
      ADD CONSTRAINT humans_legitimacy_confidence_range_ck
      CHECK (human_legitimacy_confidence >= 0 AND human_legitimacy_confidence <= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_legitimacy_score_range_ck'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_legitimacy_score_range_ck
      CHECK (agent_legitimacy_score >= 0 AND agent_legitimacy_score <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_legitimacy_confidence_range_ck'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_legitimacy_confidence_range_ck
      CHECK (agent_legitimacy_confidence >= 0 AND agent_legitimacy_confidence <= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_legitimacy_score_range_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_legitimacy_score_range_ck
      CHECK (bounty_legitimacy_score >= 0 AND bounty_legitimacy_score <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bounties_legitimacy_confidence_range_ck'
  ) THEN
    ALTER TABLE bounties
      ADD CONSTRAINT bounties_legitimacy_confidence_range_ck
      CHECK (bounty_legitimacy_confidence >= 0 AND bounty_legitimacy_confidence <= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS quality_score_snapshots (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('human', 'agent', 'bounty')),
  entity_id UUID NOT NULL,
  score_type TEXT NOT NULL CHECK (score_type IN ('human_legitimacy', 'agent_legitimacy', 'bounty_legitimacy')),
  score_value NUMERIC(5,2) NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  version TEXT NOT NULL,
  sample_size NUMERIC(12,4) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_score_snapshots_lookup
  ON quality_score_snapshots (entity_type, entity_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_quality_score_snapshots_type
  ON quality_score_snapshots (score_type, computed_at DESC);

CREATE TABLE IF NOT EXISTS quality_score_components (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES quality_score_snapshots(id) ON DELETE CASCADE,
  component_key TEXT NOT NULL,
  raw_value NUMERIC(12,6) NOT NULL,
  normalized_value NUMERIC(12,6) NOT NULL,
  weight NUMERIC(12,6) NOT NULL,
  contribution NUMERIC(12,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_score_components_snapshot
  ON quality_score_components (snapshot_id);

CREATE OR REPLACE FUNCTION quality_clamp01(p_value NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(GREATEST(COALESCE(p_value, 0), 0), 1);
$$;

CREATE OR REPLACE FUNCTION quality_clamp100(p_value NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(GREATEST(COALESCE(p_value, 0), 0), 100);
$$;

CREATE OR REPLACE FUNCTION quality_bayes_rate(
  p_successes NUMERIC,
  p_total NUMERIC,
  p_prior_mean NUMERIC DEFAULT 0.5,
  p_prior_strength NUMERIC DEFAULT 20
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT quality_clamp01(
    (COALESCE(p_successes, 0) + (quality_clamp01(p_prior_mean) * GREATEST(COALESCE(p_prior_strength, 0), 0)))
    /
    NULLIF(COALESCE(p_total, 0) + GREATEST(COALESCE(p_prior_strength, 0), 0), 0)
  );
$$;

CREATE OR REPLACE FUNCTION quality_confidence(
  p_sample_size NUMERIC,
  p_k NUMERIC DEFAULT 30
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT quality_clamp01(
    COALESCE(p_sample_size, 0)
    /
    NULLIF(COALESCE(p_sample_size, 0) + GREATEST(COALESCE(p_k, 30), 0.0001), 0)
  );
$$;

CREATE OR REPLACE FUNCTION quality_time_decay(
  p_event_ts TIMESTAMPTZ,
  p_half_life_days NUMERIC DEFAULT 90
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_event_ts IS NULL THEN 0
    ELSE POWER(
      0.5,
      GREATEST(EXTRACT(EPOCH FROM (NOW() - p_event_ts)) / 86400.0, 0)
      /
      GREATEST(COALESCE(p_half_life_days, 90), 0.0001)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION compute_bounty_legitimacy_v1(p_bounty_id UUID)
RETURNS TABLE (
  bounty_id UUID,
  score NUMERIC,
  confidence NUMERIC,
  version TEXT,
  sample_size NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bounty bounties%ROWTYPE;
  v_agent_score NUMERIC := 50;

  v_apps_total NUMERIC := 0;
  v_apps_accepted NUMERIC := 0;
  v_bookings_total NUMERIC := 0;
  v_bookings_completed NUMERIC := 0;
  v_bookings_cancelled NUMERIC := 0;
  v_funded_or_released NUMERIC := 0;
  v_disputes_open NUMERIC := 0;
  v_unique_humans NUMERIC := 0;

  v_poster_quality NUMERIC := 0.5;
  v_moderation_safety NUMERIC := 0.5;
  v_funding_reliability NUMERIC := 0.5;
  v_dispute_safety NUMERIC := 0.5;
  v_spec_clarity NUMERIC := 0.5;
  v_price_sanity NUMERIC := 0.5;
  v_integrity NUMERIC := 0.5;
  v_cancel_safety NUMERIC := 0.5;
  v_diversity NUMERIC := 0.5;

  v_recent_completion NUMERIC := 0.5;
  v_old_completion NUMERIC := 0.5;

  w_poster_quality CONSTANT NUMERIC := 0.20;
  w_moderation_safety CONSTANT NUMERIC := 0.20;
  w_funding_reliability CONSTANT NUMERIC := 0.15;
  w_dispute_safety CONSTANT NUMERIC := 0.15;
  w_spec_clarity CONSTANT NUMERIC := 0.08;
  w_price_sanity CONSTANT NUMERIC := 0.08;
  w_integrity CONSTANT NUMERIC := 0.08;
  w_cancel_safety CONSTANT NUMERIC := 0.04;
  w_diversity CONSTANT NUMERIC := 0.02;

  v_raw_weighted NUMERIC := 0;
  v_confidence NUMERIC := 0;
  v_final_score NUMERIC := 50;
  v_sample_size NUMERIC := 0;
  v_snapshot_id BIGINT;
BEGIN
  SELECT *
  INTO v_bounty
  FROM bounties
  WHERE id = p_bounty_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(agent_legitimacy_score, 50)
  INTO v_agent_score
  FROM agents
  WHERE id = v_bounty.agent_id;

  v_poster_quality := quality_clamp01(v_agent_score / 100.0);

  SELECT
    COUNT(*)::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC
  INTO v_apps_total, v_apps_accepted
  FROM applications
  WHERE bounty_id = p_bounty_id;

  SELECT
    COUNT(*)::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'cancelled')::NUMERIC,
    COUNT(*) FILTER (WHERE escrow_status IN ('funded', 'released'))::NUMERIC,
    COUNT(DISTINCT human_id)::NUMERIC
  INTO v_bookings_total, v_bookings_completed, v_bookings_cancelled, v_funded_or_released, v_unique_humans
  FROM bookings
  WHERE bounty_id = p_bounty_id;

  SELECT COUNT(*)::NUMERIC
  INTO v_disputes_open
  FROM disputes d
  JOIN bookings bk ON bk.id = d.booking_id
  WHERE bk.bounty_id = p_bounty_id
    AND d.status IN ('open', 'under_review');

  -- Application acceptance integrity with anti-farming cap per human.
  WITH app_events AS (
    SELECT
      a.human_id::TEXT AS pair_key,
      quality_time_decay(a.created_at, 90) AS event_weight,
      CASE WHEN a.status = 'accepted' THEN quality_time_decay(a.created_at, 90) ELSE 0 END AS accepted_weight
    FROM applications a
    WHERE a.bounty_id = p_bounty_id
  ),
  pair_rollup AS (
    SELECT
      pair_key,
      SUM(event_weight) AS total_weight,
      SUM(accepted_weight) AS accepted_weight
    FROM app_events
    GROUP BY pair_key
  ),
  pair_capped AS (
    SELECT
      pair_key,
      accepted_weight,
      total_weight,
      LEAST(
        COALESCE(total_weight / NULLIF(SUM(total_weight) OVER (), 0), 0),
        0.25
      ) AS capped_weight
    FROM pair_rollup
  ),
  pair_normalized AS (
    SELECT
      pair_key,
      accepted_weight,
      total_weight,
      CASE
        WHEN SUM(capped_weight) OVER () = 0 THEN 0
        ELSE capped_weight / SUM(capped_weight) OVER ()
      END AS normalized_pair_weight
    FROM pair_capped
  )
  SELECT COALESCE(
    SUM(
      quality_bayes_rate(accepted_weight, total_weight, 0.5, 20)
      * normalized_pair_weight
    ),
    quality_bayes_rate(v_apps_accepted, v_apps_total, 0.5, 20)
  )
  INTO v_integrity
  FROM pair_normalized;

  SELECT quality_bayes_rate(v_funded_or_released, v_bookings_total, 0.7, 20)
  INTO v_funding_reliability;

  v_dispute_safety := 1 - quality_bayes_rate(v_disputes_open, v_bookings_total, 0.05, 20);
  v_cancel_safety := 1 - quality_bayes_rate(v_bookings_cancelled, v_bookings_total, 0.10, 20);

  v_diversity := quality_clamp01(
    COALESCE(v_unique_humans / NULLIF(GREATEST(v_bookings_total, v_apps_accepted, 1), 0), 0)
  );

  v_moderation_safety := 1 - quality_clamp01(
    (
      COALESCE(v_bounty.moderation_risk_score, 0)
      + COALESCE((SELECT AVG(a.moderation_risk_score) FROM applications a WHERE a.bounty_id = p_bounty_id), 0)
    ) / 2.0
  );

  v_spec_clarity := quality_clamp01(
    (
      CASE WHEN char_length(COALESCE(v_bounty.title, '')) >= 16 THEN 0.2 ELSE 0.05 END
      + CASE WHEN char_length(COALESCE(v_bounty.description, '')) >= 120 THEN 0.3 ELSE 0.1 END
      + CASE WHEN COALESCE(array_length(v_bounty.skills_required, 1), 0) >= 2 THEN 0.2 ELSE 0.05 END
      + CASE WHEN v_bounty.deadline IS NOT NULL THEN 0.1 ELSE 0.05 END
      + CASE WHEN v_bounty.budget_min > 0 AND v_bounty.budget_max >= v_bounty.budget_min THEN 0.2 ELSE 0.05 END
    )
  );

  v_price_sanity := COALESCE((
    WITH midpoint AS (
      SELECT ((v_bounty.budget_min + v_bounty.budget_max)::NUMERIC / 2.0) AS target_mid
    ),
    peer AS (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ((b.budget_min + b.budget_max)::NUMERIC / 2.0)) AS peer_mid
      FROM bounties b
      WHERE b.agent_id = v_bounty.agent_id
        AND b.id <> p_bounty_id
    )
    SELECT quality_clamp01(
      1 - (
        ABS((m.target_mid - p.peer_mid) / NULLIF(p.peer_mid, 0)) / 2.0
      )
    )
    FROM midpoint m
    CROSS JOIN peer p
  ), 0.7);

  SELECT
    quality_bayes_rate(
      COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
      COUNT(*)::NUMERIC,
      0.6,
      20
    )
  INTO v_recent_completion
  FROM bookings
  WHERE bounty_id = p_bounty_id
    AND created_at >= NOW() - INTERVAL '90 days';

  SELECT
    quality_bayes_rate(
      COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
      COUNT(*)::NUMERIC,
      0.6,
      20
    )
  INTO v_old_completion
  FROM bookings
  WHERE bounty_id = p_bounty_id
    AND created_at < NOW() - INTERVAL '90 days';

  IF v_old_completion IS NOT NULL THEN
    v_integrity := (v_integrity * 0.7) + ((1 - ABS(v_recent_completion - v_old_completion)) * 0.3);
  END IF;

  v_raw_weighted :=
    (w_poster_quality * v_poster_quality)
    + (w_moderation_safety * v_moderation_safety)
    + (w_funding_reliability * v_funding_reliability)
    + (w_dispute_safety * v_dispute_safety)
    + (w_spec_clarity * v_spec_clarity)
    + (w_price_sanity * v_price_sanity)
    + (w_integrity * v_integrity)
    + (w_cancel_safety * v_cancel_safety)
    + (w_diversity * v_diversity);

  v_sample_size := COALESCE(v_apps_total, 0) + COALESCE(v_bookings_total, 0);
  v_confidence := quality_confidence(v_sample_size, 30);
  v_final_score := quality_clamp100(50 + (v_confidence * ((v_raw_weighted * 100) - 50)));

  UPDATE bounties
  SET
    bounty_legitimacy_score = ROUND(v_final_score::NUMERIC, 2),
    bounty_legitimacy_confidence = ROUND(v_confidence::NUMERIC, 3),
    bounty_legitimacy_version = 'v1',
    updated_at = NOW()
  WHERE id = p_bounty_id;

  INSERT INTO quality_score_snapshots (
    entity_type,
    entity_id,
    score_type,
    score_value,
    confidence,
    version,
    sample_size,
    metadata
  )
  VALUES (
    'bounty',
    p_bounty_id,
    'bounty_legitimacy',
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1',
    v_sample_size,
    jsonb_build_object(
      'apps_total', v_apps_total,
      'bookings_total', v_bookings_total,
      'disputes_open', v_disputes_open
    )
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO quality_score_components (snapshot_id, component_key, raw_value, normalized_value, weight, contribution)
  VALUES
    (v_snapshot_id, 'poster_quality', v_poster_quality, v_poster_quality, w_poster_quality, (v_poster_quality * w_poster_quality * 100)),
    (v_snapshot_id, 'moderation_safety', v_moderation_safety, v_moderation_safety, w_moderation_safety, (v_moderation_safety * w_moderation_safety * 100)),
    (v_snapshot_id, 'funding_reliability', v_funding_reliability, v_funding_reliability, w_funding_reliability, (v_funding_reliability * w_funding_reliability * 100)),
    (v_snapshot_id, 'dispute_safety', v_dispute_safety, v_dispute_safety, w_dispute_safety, (v_dispute_safety * w_dispute_safety * 100)),
    (v_snapshot_id, 'spec_clarity', v_spec_clarity, v_spec_clarity, w_spec_clarity, (v_spec_clarity * w_spec_clarity * 100)),
    (v_snapshot_id, 'price_sanity', v_price_sanity, v_price_sanity, w_price_sanity, (v_price_sanity * w_price_sanity * 100)),
    (v_snapshot_id, 'acceptance_integrity', v_integrity, v_integrity, w_integrity, (v_integrity * w_integrity * 100)),
    (v_snapshot_id, 'cancel_safety', v_cancel_safety, v_cancel_safety, w_cancel_safety, (v_cancel_safety * w_cancel_safety * 100)),
    (v_snapshot_id, 'counterparty_diversity', v_diversity, v_diversity, w_diversity, (v_diversity * w_diversity * 100));

  RETURN QUERY
  SELECT
    p_bounty_id,
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1'::TEXT,
    v_sample_size;
END;
$$;

CREATE OR REPLACE FUNCTION compute_human_legitimacy_v1(p_human_id UUID)
RETURNS TABLE (
  human_id UUID,
  score NUMERIC,
  confidence NUMERIC,
  version TEXT,
  sample_size NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_human humans%ROWTYPE;

  v_apps_total NUMERIC := 0;
  v_apps_accepted NUMERIC := 0;
  v_bookings_total NUMERIC := 0;
  v_bookings_completed NUMERIC := 0;
  v_bookings_cancelled NUMERIC := 0;
  v_funded_or_released NUMERIC := 0;
  v_disputes_open NUMERIC := 0;
  v_unique_agents NUMERIC := 0;

  v_completion_reliability NUMERIC := 0.5;
  v_dispute_safety NUMERIC := 0.5;
  v_cancel_safety NUMERIC := 0.5;
  v_quality_adjusted_accept NUMERIC := 0.5;
  v_moderation_safety NUMERIC := 0.5;
  v_escrow_reliability NUMERIC := 0.5;
  v_responsiveness NUMERIC := 0.6;
  v_diversity NUMERIC := 0.5;
  v_stability NUMERIC := 0.6;
  v_verified_maturity NUMERIC := 0.5;

  v_recent_completion NUMERIC := 0.5;
  v_old_completion NUMERIC := 0.5;

  w_completion_reliability CONSTANT NUMERIC := 0.20;
  w_dispute_safety CONSTANT NUMERIC := 0.20;
  w_cancel_safety CONSTANT NUMERIC := 0.10;
  w_quality_adjusted_accept CONSTANT NUMERIC := 0.10;
  w_moderation_safety CONSTANT NUMERIC := 0.10;
  w_escrow_reliability CONSTANT NUMERIC := 0.10;
  w_responsiveness CONSTANT NUMERIC := 0.10;
  w_diversity CONSTANT NUMERIC := 0.05;
  w_stability CONSTANT NUMERIC := 0.03;
  w_verified_maturity CONSTANT NUMERIC := 0.02;

  v_raw_weighted NUMERIC := 0;
  v_confidence NUMERIC := 0;
  v_final_score NUMERIC := 50;
  v_sample_size NUMERIC := 0;
  v_snapshot_id BIGINT;
BEGIN
  SELECT *
  INTO v_human
  FROM humans
  WHERE id = p_human_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC
  INTO v_apps_total, v_apps_accepted
  FROM applications
  WHERE human_id = p_human_id;

  SELECT
    COUNT(*)::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'cancelled')::NUMERIC,
    COUNT(*) FILTER (WHERE escrow_status IN ('funded', 'released'))::NUMERIC,
    COUNT(DISTINCT agent_id)::NUMERIC
  INTO v_bookings_total, v_bookings_completed, v_bookings_cancelled, v_funded_or_released, v_unique_agents
  FROM bookings
  WHERE human_id = p_human_id;

  SELECT COUNT(*)::NUMERIC
  INTO v_disputes_open
  FROM disputes d
  JOIN bookings bk ON bk.id = d.booking_id
  WHERE bk.human_id = p_human_id
    AND d.status IN ('open', 'under_review');

  v_completion_reliability := quality_bayes_rate(v_bookings_completed, GREATEST(v_bookings_total, v_apps_accepted, 0), 0.65, 20);
  v_dispute_safety := 1 - quality_bayes_rate(v_disputes_open, v_bookings_total, 0.05, 20);
  v_cancel_safety := 1 - quality_bayes_rate(v_bookings_cancelled, v_bookings_total, 0.10, 20);

  -- Quality-adjusted acceptance ratio with anti-farming cap and low-BLS downweight.
  WITH app_events AS (
    SELECT
      COALESCE(b.agent_id::TEXT, 'none') AS pair_key,
      quality_time_decay(a.created_at, 90)
      * GREATEST(COALESCE(b.bounty_legitimacy_score, 50), 10) / 100.0
      * CASE WHEN COALESCE(b.bounty_legitimacy_score, 50) < 40 THEN 0.25 ELSE 1 END AS app_weight,
      CASE WHEN a.status = 'accepted' THEN quality_time_decay(a.created_at, 90)
      * GREATEST(COALESCE(b.bounty_legitimacy_score, 50), 10) / 100.0
      * CASE WHEN COALESCE(b.bounty_legitimacy_score, 50) < 40 THEN 0.25 ELSE 1 END ELSE 0 END AS accepted_weight
    FROM applications a
    JOIN bounties b ON b.id = a.bounty_id
    WHERE a.human_id = p_human_id
  ),
  pair_rollup AS (
    SELECT
      pair_key,
      SUM(app_weight) AS total_weight,
      SUM(accepted_weight) AS accepted_weight
    FROM app_events
    GROUP BY pair_key
  ),
  pair_capped AS (
    SELECT
      pair_key,
      accepted_weight,
      total_weight,
      LEAST(
        COALESCE(total_weight / NULLIF(SUM(total_weight) OVER (), 0), 0),
        0.25
      ) AS capped_weight
    FROM pair_rollup
  ),
  pair_normalized AS (
    SELECT
      pair_key,
      accepted_weight,
      total_weight,
      CASE
        WHEN SUM(capped_weight) OVER () = 0 THEN 0
        ELSE capped_weight / SUM(capped_weight) OVER ()
      END AS normalized_pair_weight
    FROM pair_capped
  )
  SELECT COALESCE(
    SUM(
      quality_bayes_rate(accepted_weight, total_weight, 0.5, 20)
      * normalized_pair_weight
    ),
    quality_bayes_rate(v_apps_accepted, v_apps_total, 0.5, 20)
  )
  INTO v_quality_adjusted_accept
  FROM pair_normalized;

  v_moderation_safety := 1 - quality_clamp01(
    COALESCE((SELECT AVG(a.moderation_risk_score) FROM applications a WHERE a.human_id = p_human_id), 0)
  );

  v_escrow_reliability := quality_bayes_rate(v_funded_or_released, v_bookings_total, 0.7, 20);

  v_diversity := quality_clamp01(
    COALESCE(v_unique_agents / NULLIF(GREATEST(v_bookings_total, v_apps_total, 1), 0), 0)
  );

  SELECT quality_clamp01(
    1 - (
      GREATEST(
        COALESCE(AVG(EXTRACT(EPOCH FROM (created_at - prev_created_at)) / 3600.0), 24),
        0
      ) / 24.0
    )
  )
  INTO v_responsiveness
  FROM (
    SELECT
      m.created_at,
      LAG(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_sender_type,
      LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.human_id = p_human_id
  ) ordered_msgs
  WHERE sender_type = 'human'
    AND prev_sender_type = 'agent';

  IF v_responsiveness IS NULL THEN
    v_responsiveness := 0.6;
  END IF;

  SELECT quality_bayes_rate(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*)::NUMERIC,
    0.6,
    20
  )
  INTO v_recent_completion
  FROM bookings
  WHERE human_id = p_human_id
    AND created_at >= NOW() - INTERVAL '90 days';

  SELECT quality_bayes_rate(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*)::NUMERIC,
    0.6,
    20
  )
  INTO v_old_completion
  FROM bookings
  WHERE human_id = p_human_id
    AND created_at < NOW() - INTERVAL '90 days';

  v_stability := 1 - ABS(COALESCE(v_recent_completion, 0.5) - COALESCE(v_old_completion, 0.5));

  v_verified_maturity := quality_clamp01(
    (CASE WHEN COALESCE(v_human.is_verified, false) THEN 0.5 ELSE 0 END)
    + LEAST(GREATEST(EXTRACT(EPOCH FROM (NOW() - v_human.created_at)) / 86400.0, 0) / 180.0, 1) * 0.5
  );

  v_raw_weighted :=
    (w_completion_reliability * v_completion_reliability)
    + (w_dispute_safety * v_dispute_safety)
    + (w_cancel_safety * v_cancel_safety)
    + (w_quality_adjusted_accept * v_quality_adjusted_accept)
    + (w_moderation_safety * v_moderation_safety)
    + (w_escrow_reliability * v_escrow_reliability)
    + (w_responsiveness * v_responsiveness)
    + (w_diversity * v_diversity)
    + (w_stability * v_stability)
    + (w_verified_maturity * v_verified_maturity);

  v_sample_size := COALESCE(v_apps_total, 0) + COALESCE(v_bookings_total, 0);
  v_confidence := quality_confidence(v_sample_size, 30);
  v_final_score := quality_clamp100(50 + (v_confidence * ((v_raw_weighted * 100) - 50)));

  UPDATE humans
  SET
    human_legitimacy_score = ROUND(v_final_score::NUMERIC, 2),
    human_legitimacy_confidence = ROUND(v_confidence::NUMERIC, 3),
    human_legitimacy_version = 'v1',
    updated_at = NOW()
  WHERE id = p_human_id;

  INSERT INTO quality_score_snapshots (
    entity_type,
    entity_id,
    score_type,
    score_value,
    confidence,
    version,
    sample_size,
    metadata
  )
  VALUES (
    'human',
    p_human_id,
    'human_legitimacy',
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1',
    v_sample_size,
    jsonb_build_object(
      'applications_total', v_apps_total,
      'bookings_total', v_bookings_total,
      'disputes_open', v_disputes_open
    )
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO quality_score_components (snapshot_id, component_key, raw_value, normalized_value, weight, contribution)
  VALUES
    (v_snapshot_id, 'completion_reliability', v_completion_reliability, v_completion_reliability, w_completion_reliability, (v_completion_reliability * w_completion_reliability * 100)),
    (v_snapshot_id, 'dispute_safety', v_dispute_safety, v_dispute_safety, w_dispute_safety, (v_dispute_safety * w_dispute_safety * 100)),
    (v_snapshot_id, 'cancel_safety', v_cancel_safety, v_cancel_safety, w_cancel_safety, (v_cancel_safety * w_cancel_safety * 100)),
    (v_snapshot_id, 'quality_adjusted_accept', v_quality_adjusted_accept, v_quality_adjusted_accept, w_quality_adjusted_accept, (v_quality_adjusted_accept * w_quality_adjusted_accept * 100)),
    (v_snapshot_id, 'moderation_safety', v_moderation_safety, v_moderation_safety, w_moderation_safety, (v_moderation_safety * w_moderation_safety * 100)),
    (v_snapshot_id, 'escrow_reliability', v_escrow_reliability, v_escrow_reliability, w_escrow_reliability, (v_escrow_reliability * w_escrow_reliability * 100)),
    (v_snapshot_id, 'responsiveness', v_responsiveness, v_responsiveness, w_responsiveness, (v_responsiveness * w_responsiveness * 100)),
    (v_snapshot_id, 'counterparty_diversity', v_diversity, v_diversity, w_diversity, (v_diversity * w_diversity * 100)),
    (v_snapshot_id, 'stability', v_stability, v_stability, w_stability, (v_stability * w_stability * 100)),
    (v_snapshot_id, 'verified_maturity', v_verified_maturity, v_verified_maturity, w_verified_maturity, (v_verified_maturity * w_verified_maturity * 100));

  RETURN QUERY
  SELECT
    p_human_id,
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1'::TEXT,
    v_sample_size;
END;
$$;

CREATE OR REPLACE FUNCTION compute_agent_legitimacy_v1(p_agent_id UUID)
RETURNS TABLE (
  agent_id UUID,
  score NUMERIC,
  confidence NUMERIC,
  version TEXT,
  sample_size NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent agents%ROWTYPE;

  v_bookings_total NUMERIC := 0;
  v_bookings_completed NUMERIC := 0;
  v_bookings_cancelled NUMERIC := 0;
  v_funded_or_released NUMERIC := 0;
  v_disputes_open NUMERIC := 0;
  v_unique_humans NUMERIC := 0;
  v_bounties_total NUMERIC := 0;

  v_completion_reliability NUMERIC := 0.5;
  v_dispute_safety NUMERIC := 0.5;
  v_cancel_safety NUMERIC := 0.5;
  v_satisfaction_proxy NUMERIC := 0.5;
  v_moderation_safety NUMERIC := 0.5;
  v_escrow_reliability NUMERIC := 0.5;
  v_responsiveness NUMERIC := 0.6;
  v_diversity NUMERIC := 0.5;
  v_stability NUMERIC := 0.6;
  v_maturity NUMERIC := 0.5;

  v_recent_completion NUMERIC := 0.5;
  v_old_completion NUMERIC := 0.5;

  w_completion_reliability CONSTANT NUMERIC := 0.20;
  w_dispute_safety CONSTANT NUMERIC := 0.20;
  w_cancel_safety CONSTANT NUMERIC := 0.10;
  w_satisfaction_proxy CONSTANT NUMERIC := 0.10;
  w_moderation_safety CONSTANT NUMERIC := 0.10;
  w_escrow_reliability CONSTANT NUMERIC := 0.10;
  w_responsiveness CONSTANT NUMERIC := 0.10;
  w_diversity CONSTANT NUMERIC := 0.05;
  w_stability CONSTANT NUMERIC := 0.03;
  w_maturity CONSTANT NUMERIC := 0.02;

  v_raw_weighted NUMERIC := 0;
  v_confidence NUMERIC := 0;
  v_final_score NUMERIC := 50;
  v_sample_size NUMERIC := 0;
  v_snapshot_id BIGINT;
BEGIN
  SELECT *
  INTO v_agent
  FROM agents
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*) FILTER (WHERE status = 'cancelled')::NUMERIC,
    COUNT(*) FILTER (WHERE escrow_status IN ('funded', 'released'))::NUMERIC,
    COUNT(DISTINCT human_id)::NUMERIC
  INTO v_bookings_total, v_bookings_completed, v_bookings_cancelled, v_funded_or_released, v_unique_humans
  FROM bookings
  WHERE agent_id = p_agent_id;

  SELECT COUNT(*)::NUMERIC
  INTO v_disputes_open
  FROM disputes d
  JOIN bookings bk ON bk.id = d.booking_id
  WHERE bk.agent_id = p_agent_id
    AND d.status IN ('open', 'under_review');

  SELECT COUNT(*)::NUMERIC
  INTO v_bounties_total
  FROM bounties
  WHERE agent_id = p_agent_id;

  -- Completion reliability with anti-farming cap by human.
  WITH booking_events AS (
    SELECT
      b.human_id::TEXT AS pair_key,
      quality_time_decay(b.created_at, 90) AS event_weight,
      CASE WHEN b.status = 'completed' THEN quality_time_decay(b.created_at, 90) ELSE 0 END AS completed_weight
    FROM bookings b
    WHERE b.agent_id = p_agent_id
  ),
  pair_rollup AS (
    SELECT
      pair_key,
      SUM(event_weight) AS total_weight,
      SUM(completed_weight) AS completed_weight
    FROM booking_events
    GROUP BY pair_key
  ),
  pair_capped AS (
    SELECT
      pair_key,
      completed_weight,
      total_weight,
      LEAST(
        COALESCE(total_weight / NULLIF(SUM(total_weight) OVER (), 0), 0),
        0.25
      ) AS capped_weight
    FROM pair_rollup
  ),
  pair_normalized AS (
    SELECT
      pair_key,
      completed_weight,
      total_weight,
      CASE
        WHEN SUM(capped_weight) OVER () = 0 THEN 0
        ELSE capped_weight / SUM(capped_weight) OVER ()
      END AS normalized_pair_weight
    FROM pair_capped
  )
  SELECT COALESCE(
    SUM(
      quality_bayes_rate(completed_weight, total_weight, 0.6, 20)
      * normalized_pair_weight
    ),
    quality_bayes_rate(v_bookings_completed, v_bookings_total, 0.6, 20)
  )
  INTO v_completion_reliability
  FROM pair_normalized;

  v_dispute_safety := 1 - quality_bayes_rate(v_disputes_open, v_bookings_total, 0.05, 20);
  v_cancel_safety := 1 - quality_bayes_rate(v_bookings_cancelled, v_bookings_total, 0.10, 20);

  v_satisfaction_proxy := quality_clamp01(
    (
      quality_clamp01(COALESCE(v_agent.rating_average, 0) / 5.0) * 0.7
      + quality_confidence(COALESCE(v_agent.rating_count, 0), 20) * 0.3
    )
  );

  v_moderation_safety := 1 - quality_clamp01(
    COALESCE((SELECT AVG(b.moderation_risk_score) FROM bounties b WHERE b.agent_id = p_agent_id), 0)
  );

  v_escrow_reliability := quality_bayes_rate(v_funded_or_released, v_bookings_total, 0.7, 20);

  v_diversity := quality_clamp01(
    COALESCE(v_unique_humans / NULLIF(GREATEST(v_bookings_total, 1), 0), 0)
  );

  SELECT quality_clamp01(
    1 - (
      GREATEST(
        COALESCE(AVG(EXTRACT(EPOCH FROM (created_at - prev_created_at)) / 3600.0), 24),
        0
      ) / 24.0
    )
  )
  INTO v_responsiveness
  FROM (
    SELECT
      m.created_at,
      LAG(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_sender_type,
      LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS prev_created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.agent_id = p_agent_id
  ) ordered_msgs
  WHERE sender_type = 'agent'
    AND prev_sender_type = 'human';

  IF v_responsiveness IS NULL THEN
    v_responsiveness := 0.6;
  END IF;

  SELECT quality_bayes_rate(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*)::NUMERIC,
    0.6,
    20
  )
  INTO v_recent_completion
  FROM bookings
  WHERE agent_id = p_agent_id
    AND created_at >= NOW() - INTERVAL '90 days';

  SELECT quality_bayes_rate(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC,
    COUNT(*)::NUMERIC,
    0.6,
    20
  )
  INTO v_old_completion
  FROM bookings
  WHERE agent_id = p_agent_id
    AND created_at < NOW() - INTERVAL '90 days';

  v_stability := 1 - ABS(COALESCE(v_recent_completion, 0.5) - COALESCE(v_old_completion, 0.5));

  v_maturity := quality_clamp01(
    LEAST(GREATEST(EXTRACT(EPOCH FROM (NOW() - v_agent.created_at)) / 86400.0, 0) / 365.0, 1) * 0.6
    + quality_confidence(v_bookings_total + v_bounties_total, 20) * 0.4
  );

  v_raw_weighted :=
    (w_completion_reliability * v_completion_reliability)
    + (w_dispute_safety * v_dispute_safety)
    + (w_cancel_safety * v_cancel_safety)
    + (w_satisfaction_proxy * v_satisfaction_proxy)
    + (w_moderation_safety * v_moderation_safety)
    + (w_escrow_reliability * v_escrow_reliability)
    + (w_responsiveness * v_responsiveness)
    + (w_diversity * v_diversity)
    + (w_stability * v_stability)
    + (w_maturity * v_maturity);

  v_sample_size := COALESCE(v_bookings_total, 0) + COALESCE(v_bounties_total, 0);
  v_confidence := quality_confidence(v_sample_size, 30);
  v_final_score := quality_clamp100(50 + (v_confidence * ((v_raw_weighted * 100) - 50)));

  UPDATE agents
  SET
    agent_legitimacy_score = ROUND(v_final_score::NUMERIC, 2),
    agent_legitimacy_confidence = ROUND(v_confidence::NUMERIC, 3),
    agent_legitimacy_version = 'v1',
    updated_at = NOW()
  WHERE id = p_agent_id;

  INSERT INTO quality_score_snapshots (
    entity_type,
    entity_id,
    score_type,
    score_value,
    confidence,
    version,
    sample_size,
    metadata
  )
  VALUES (
    'agent',
    p_agent_id,
    'agent_legitimacy',
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1',
    v_sample_size,
    jsonb_build_object(
      'bookings_total', v_bookings_total,
      'bounties_total', v_bounties_total,
      'disputes_open', v_disputes_open
    )
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO quality_score_components (snapshot_id, component_key, raw_value, normalized_value, weight, contribution)
  VALUES
    (v_snapshot_id, 'completion_reliability', v_completion_reliability, v_completion_reliability, w_completion_reliability, (v_completion_reliability * w_completion_reliability * 100)),
    (v_snapshot_id, 'dispute_safety', v_dispute_safety, v_dispute_safety, w_dispute_safety, (v_dispute_safety * w_dispute_safety * 100)),
    (v_snapshot_id, 'cancel_safety', v_cancel_safety, v_cancel_safety, w_cancel_safety, (v_cancel_safety * w_cancel_safety * 100)),
    (v_snapshot_id, 'satisfaction_proxy', v_satisfaction_proxy, v_satisfaction_proxy, w_satisfaction_proxy, (v_satisfaction_proxy * w_satisfaction_proxy * 100)),
    (v_snapshot_id, 'moderation_safety', v_moderation_safety, v_moderation_safety, w_moderation_safety, (v_moderation_safety * w_moderation_safety * 100)),
    (v_snapshot_id, 'escrow_reliability', v_escrow_reliability, v_escrow_reliability, w_escrow_reliability, (v_escrow_reliability * w_escrow_reliability * 100)),
    (v_snapshot_id, 'responsiveness', v_responsiveness, v_responsiveness, w_responsiveness, (v_responsiveness * w_responsiveness * 100)),
    (v_snapshot_id, 'counterparty_diversity', v_diversity, v_diversity, w_diversity, (v_diversity * w_diversity * 100)),
    (v_snapshot_id, 'stability', v_stability, v_stability, w_stability, (v_stability * w_stability * 100)),
    (v_snapshot_id, 'maturity', v_maturity, v_maturity, w_maturity, (v_maturity * w_maturity * 100));

  RETURN QUERY
  SELECT
    p_agent_id,
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1'::TEXT,
    v_sample_size;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_quality_scores_for_bounty_v1(p_bounty_id UUID)
RETURNS TABLE (
  bounty_id UUID,
  bounty_score NUMERIC,
  bounty_confidence NUMERIC,
  humans_recomputed INTEGER,
  agents_recomputed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bounty_agent_id UUID;
  v_human_id UUID;
  v_humans_recomputed INTEGER := 0;
  v_agents_recomputed INTEGER := 0;
  v_bounty_score NUMERIC := 50;
  v_bounty_confidence NUMERIC := 0;
BEGIN
  SELECT agent_id INTO v_bounty_agent_id FROM bounties WHERE id = p_bounty_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT score, confidence
  INTO v_bounty_score, v_bounty_confidence
  FROM compute_bounty_legitimacy_v1(p_bounty_id)
  LIMIT 1;

  FOR v_human_id IN
    SELECT DISTINCT human_id
    FROM (
      SELECT a.human_id FROM applications a WHERE a.bounty_id = p_bounty_id
      UNION
      SELECT bk.human_id FROM bookings bk WHERE bk.bounty_id = p_bounty_id
    ) humans_union
  LOOP
    PERFORM compute_human_legitimacy_v1(v_human_id);
    v_humans_recomputed := v_humans_recomputed + 1;
  END LOOP;

  PERFORM compute_agent_legitimacy_v1(v_bounty_agent_id);
  v_agents_recomputed := 1;

  RETURN QUERY
  SELECT p_bounty_id, v_bounty_score, v_bounty_confidence, v_humans_recomputed, v_agents_recomputed;
END;
$$;

CREATE OR REPLACE FUNCTION recompute_quality_scores_v1(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  bounties_recomputed INTEGER,
  humans_recomputed INTEGER,
  agents_recomputed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bounty_id UUID;
  v_human_id UUID;
  v_agent_id UUID;

  v_bounties_recomputed INTEGER := 0;
  v_humans_recomputed INTEGER := 0;
  v_agents_recomputed INTEGER := 0;
BEGIN
  FOR v_bounty_id IN
    SELECT b.id
    FROM bounties b
    WHERE p_since IS NULL OR b.updated_at >= p_since OR b.created_at >= p_since
  LOOP
    PERFORM compute_bounty_legitimacy_v1(v_bounty_id);
    v_bounties_recomputed := v_bounties_recomputed + 1;
  END LOOP;

  FOR v_human_id IN
    SELECT h.id
    FROM humans h
    WHERE p_since IS NULL
      OR h.updated_at >= p_since
      OR h.created_at >= p_since
      OR EXISTS (SELECT 1 FROM applications a WHERE a.human_id = h.id AND (a.updated_at >= p_since OR a.created_at >= p_since))
      OR EXISTS (SELECT 1 FROM bookings bk WHERE bk.human_id = h.id AND (bk.updated_at >= p_since OR bk.created_at >= p_since))
  LOOP
    PERFORM compute_human_legitimacy_v1(v_human_id);
    v_humans_recomputed := v_humans_recomputed + 1;
  END LOOP;

  FOR v_agent_id IN
    SELECT a.id
    FROM agents a
    WHERE p_since IS NULL
      OR a.updated_at >= p_since
      OR a.created_at >= p_since
      OR EXISTS (SELECT 1 FROM bounties b WHERE b.agent_id = a.id AND (b.updated_at >= p_since OR b.created_at >= p_since))
      OR EXISTS (SELECT 1 FROM bookings bk WHERE bk.agent_id = a.id AND (bk.updated_at >= p_since OR bk.created_at >= p_since))
  LOOP
    PERFORM compute_agent_legitimacy_v1(v_agent_id);
    v_agents_recomputed := v_agents_recomputed + 1;
  END LOOP;

  RETURN QUERY SELECT v_bounties_recomputed, v_humans_recomputed, v_agents_recomputed;
END;
$$;
