/**
 * coerceStringArray
 *
 * Defensive coercion for Prisma String[] fields that may arrive as a raw JSON
 * string when the underlying Postgres column is TEXT/JSONB instead of TEXT[].
 *
 * After the 20260624_fix_string_array_column_types migration runs this becomes
 * a pass-through (Prisma returns a real JS array). Until then it prevents a
 * runtime crash by parsing the JSON string manually.
 *
 * Usage:
 *   artist.genreTags = coerceStringArray(artist.genreTags)
 */
export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
