-- Harden Supabase-managed trigger functions flagged by the live security advisor.
-- Event-trigger execution is managed by PostgreSQL; public API roles do not
-- need EXECUTE permission on the event-trigger function.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';
    END IF;
  END IF;

  IF to_regprocedure('public.protect_approved_verification_request()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.protect_approved_verification_request() SET search_path = pg_catalog';
  END IF;
END
$$;
