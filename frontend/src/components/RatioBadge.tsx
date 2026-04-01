interface Props {
  /** Fraction of non-direct members (0–1). */
  ratio: number
}

/** Colored badge showing the non-direct ratio. Red if > 20%. */
export default function RatioBadge({ ratio }: Props) {
  const pct   = Math.round(ratio * 100)
  const over  = ratio > 0.2

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${over ? 'bg-acme-red/10 text-acme-red' : 'bg-acme-green/10 text-acme-green'}`}>
      {over && <span className="mr-1">⚠</span>}
      {pct}% non-direct
    </span>
  )
}
