// Shared helpers for text filters (Candidates list, Pipeline board)

// Treat user input literally in ILIKE: escape the % and _ wildcards and backslash
export function likeLiteral(s: string) {
  return s.replace(/[\\%_]/g, c => '\\' + c)
}

// Value for a PostgREST or=(...) filter: double-quoted so commas/brackets can't break it
export function orLikeValue(s: string) {
  return '"' + `%${likeLiteral(s)}%`.replace(/["\\]/g, c => '\\' + c) + '"'
}

export interface RoleOption {
  label: string
  count: number
}

// Distinct preferred roles (case/space-insensitive) with counts, most common first
export function roleOptions(rows: { preferred_role: string | null }[] | null): RoleOption[] {
  const map = new Map<string, RoleOption>()
  for (const r of rows ?? []) {
    const label = r.preferred_role?.trim().replace(/\s+/g, ' ')
    if (!label) continue
    const key = label.toLowerCase()
    const hit = map.get(key)
    if (hit) hit.count++
    else map.set(key, { label, count: 1 })
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
