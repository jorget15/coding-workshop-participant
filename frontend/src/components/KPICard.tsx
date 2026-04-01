interface Props {
  label:    string
  value:    string | number
  sub?:     string
  /** Optional click handler — shows pointer cursor */
  onClick?: () => void
  color?:   'default' | 'warning' | 'danger'
}

const colorClass = {
  default: 'text-acme-action',
  warning: 'text-acme-amber',
  danger:  'text-acme-red',
}

/** Large-number KPI card used on dashboards. */
export default function KPICard({ label, value, sub, onClick, color = 'default' }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:border-acme-action transition-colors' : ''}`}
    >
      <p className="text-acme-muted text-sm font-medium">{label}</p>
      <p className={`text-4xl font-bold ${colorClass[color]}`}>{value}</p>
      {sub && <p className="text-acme-muted text-xs">{sub}</p>}
    </div>
  )
}
