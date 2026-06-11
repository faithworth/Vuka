/**
 * @deprecated Typo in filename — "superbase" should be "supabase".
 * The canonical server Supabase client is at: src/lib/supabase_server.ts
 *
 * This file re-exports everything from the correct file so any import
 * that accidentally uses this path still works without a runtime error.
 * Do not import from this file in new code.
 */
export * from './supabase_server';
