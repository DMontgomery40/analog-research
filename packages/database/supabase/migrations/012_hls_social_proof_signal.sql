-- HLS v1.1: add strong social-proof identity signal from verified social links.
-- Requires migration 011_human_social_links.sql (github_url/linkedin_url/etc).

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
  v_identity_proof NUMERIC := 0.5;
  v_social_proof NUMERIC := 0;
  v_account_age_maturity NUMERIC := 0;

  v_recent_completion NUMERIC := 0.5;
  v_old_completion NUMERIC := 0.5;

  w_completion_reliability CONSTANT NUMERIC := 0.18;
  w_dispute_safety CONSTANT NUMERIC := 0.17;
  w_cancel_safety CONSTANT NUMERIC := 0.08;
  w_quality_adjusted_accept CONSTANT NUMERIC := 0.08;
  w_moderation_safety CONSTANT NUMERIC := 0.09;
  w_escrow_reliability CONSTANT NUMERIC := 0.09;
  w_responsiveness CONSTANT NUMERIC := 0.09;
  w_diversity CONSTANT NUMERIC := 0.05;
  w_stability CONSTANT NUMERIC := 0.05;
  w_identity_proof CONSTANT NUMERIC := 0.12;

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

  v_social_proof := quality_clamp01(
    (CASE WHEN NULLIF(TRIM(COALESCE(v_human.github_url, '')), '') IS NOT NULL THEN 0.24 ELSE 0 END)
    + (CASE WHEN NULLIF(TRIM(COALESCE(v_human.linkedin_url, '')), '') IS NOT NULL THEN 0.24 ELSE 0 END)
    + (CASE WHEN NULLIF(TRIM(COALESCE(v_human.website_url, '')), '') IS NOT NULL THEN 0.20 ELSE 0 END)
    + (CASE WHEN NULLIF(TRIM(COALESCE(v_human.youtube_url, '')), '') IS NOT NULL THEN 0.16 ELSE 0 END)
    + (CASE WHEN NULLIF(TRIM(COALESCE(v_human.instagram_url, '')), '') IS NOT NULL THEN 0.16 ELSE 0 END)
  );

  v_account_age_maturity := quality_clamp01(
    LEAST(
      GREATEST(EXTRACT(EPOCH FROM (NOW() - v_human.created_at)) / 86400.0, 0) / 180.0,
      1
    )
  );

  v_identity_proof := quality_clamp01(
    (v_social_proof * 0.70)
    + ((CASE WHEN COALESCE(v_human.is_verified, false) THEN 1 ELSE 0 END) * 0.20)
    + (v_account_age_maturity * 0.10)
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
    + (w_identity_proof * v_identity_proof);

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
      'disputes_open', v_disputes_open,
      'social_proof', v_social_proof
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
    (v_snapshot_id, 'identity_proof', v_identity_proof, v_identity_proof, w_identity_proof, (v_identity_proof * w_identity_proof * 100));

  RETURN QUERY
  SELECT
    p_human_id,
    ROUND(v_final_score::NUMERIC, 2),
    ROUND(v_confidence::NUMERIC, 3),
    'v1'::TEXT,
    v_sample_size;
END;
$$;
