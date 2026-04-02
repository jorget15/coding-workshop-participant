interface Props {
  active:  number  // total active member count (all roles, including Leader)
  max?:    number  // cap, defaults to 5
}

/** Shows "X/5 members" progress indicator. Turns amber at 4, red at 5. */
export default function CapIndicator({ active, max = 5 }: Props) {
  const color =
    active >= max   ? 'bg-acme-red'   :
    active >= max-1 ? 'bg-acme-amber' :
    'bg-acme-green'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-acme-border rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min((active / max) * 100, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${active >= max ? 'text-acme-red' : active >= max-1 ? 'text-acme-amber' : 'text-acme-muted'}`}>
        {active}/{max}
      </span>
    </div>
  )
}
