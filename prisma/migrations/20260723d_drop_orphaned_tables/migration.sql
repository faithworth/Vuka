-- Confirmed orphaned via github_search_code: no app code references any of
-- these (only old phase-2 migration files and PHASE2_HANDOFF.md mention
-- them), and all 3 were empty in production. Dropping to reduce surface
-- area and stop them showing up in schema-drift/index audits.

DROP TABLE IF EXISTS "OrderMilestone";
DROP TABLE IF EXISTS "PayoutSplit";
DROP TABLE IF EXISTS "Referral";
