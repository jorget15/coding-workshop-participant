interface Props {
  /** Current value in YYYY-MM format */
  value:    string
  onChange: (val: string) => void
  label?:   string
}

/** Month picker constrained to YYYY-MM format. */
export default function MonthPicker({ value, onChange, label }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-acme-muted text-xs font-medium">{label}</label>}
      <input
        type="month"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-acme-border rounded-lg px-3 py-2 text-sm bg-acme-card text-acme-text focus:outline-none focus:ring-2 focus:ring-acme-action"
      />
    </div>
  )
}
