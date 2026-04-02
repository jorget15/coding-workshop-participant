import HorizontalBarChart from './HorizontalBarChart'

interface Props {
  data: { teamName: string; rate: number }[]
}

function colocationColor(value: number) {
  if (value >= 75) return '#16a34a'
  if (value >= 50) return '#d97706'
  return '#CC0000'
}

export default function CoLocationRateChart({ data }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <HorizontalBarChart
        data={data}
        labelKey="teamName"
        valueKey="rate"
        title="Co-location Rate per Team"
        colorFn={colocationColor}
        xDomain={[0, 100]}
        xTickFormat={v => `${v}%`}
        tooltipFormat={v => `${v}%`}
        labelWidth={100}
        emptyText="No team data available."
      />
      <div className="flex flex-wrap gap-4 text-xs text-acme-muted">
        {[
          { color: '#16a34a', label: '≥ 75%' },
          { color: '#d97706', label: '50–74%' },
          { color: '#CC0000', label: '< 50%' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
