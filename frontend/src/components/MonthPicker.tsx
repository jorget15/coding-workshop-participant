const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  /** Current value in YYYY-MM format */
  value:    string
  onChange: (val: string) => void
  label?:   string
}

/** Cross-browser month+year picker (works on Firefox). Value format: YYYY-MM */
export default function MonthPicker({ value, onChange, label }: Props) {
  const [year, month] = value ? value.split('-') : [String(new Date().getFullYear()), '01']
  const yearNum = parseInt(year, 10)

  const setYear = (y: number) => onChange(`${y}-${month}`)
  const setMonth = (m: string) => onChange(`${year}-${m}`)

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-acme-muted text-xs font-medium">{label}</label>}
      <div className="flex gap-2">
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="flex-1 border border-acme-border rounded-lg px-3 py-2 text-sm bg-acme-card text-acme-text focus:outline-none focus:ring-2 focus:ring-acme-action"
        >
          {MONTHS.map((name, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYear(yearNum - 1)}
            className="px-2 py-2 border border-acme-border rounded-lg text-sm hover:bg-acme-hover">◀</button>
          <span className="text-sm font-medium text-acme-text w-12 text-center">{year}</span>
          <button type="button" onClick={() => setYear(yearNum + 1)}
            className="px-2 py-2 border border-acme-border rounded-lg text-sm hover:bg-acme-hover">▶</button>
        </div>
      </div>
    </div>
  )
}

/** Format "2025-10" → "October 2025" */
export function formatMonth(yyyyMm: string): string {
  if (!yyyyMm) return '—'
  const [y, m] = yyyyMm.split('-')
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return yyyyMm
  return `${MONTHS[idx]} ${y}`
}
