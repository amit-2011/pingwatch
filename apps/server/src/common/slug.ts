/** Lowercase, hyphenated, ASCII slug for org/project names. Falls back to a default if empty. */
export function slugify(input: string, fallback = 'org'): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : fallback;
}
