import type { RoleOption } from '@/lib/filters'

// Role search input with suggestions from the roles candidates actually entered.
// Rendered inside a GET <form>, so the value travels as ?role=… in the URL.
export default function RoleSearch({ value, roles }: { value: string; roles: RoleOption[] }) {
  return (
    <>
      <input
        name="role"
        defaultValue={value}
        list="role-options"
        placeholder="Search by role (e.g. design)"
        aria-label="Search by role"
        className="input max-w-xs"
        autoComplete="off"
      />
      <datalist id="role-options">
        {roles.map(r => (
          <option key={r.label} value={r.label}>{`${r.count} candidate${r.count === 1 ? '' : 's'}`}</option>
        ))}
      </datalist>
    </>
  )
}
