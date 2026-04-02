import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
} from 'recharts'

interface Props {
  data: { name: string; value: number }[]
}

const COLORS = ['#003087', '#56B4E0']

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border: '1px solid var(--color-acme-border)',
  borderRadius: '8px',
  fontSize: '12px',
}

export default function DirectNonDirectDonut({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return <p className="text-acme-muted text-sm">No data.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-acme-muted text-xs font-medium uppercase tracking-wide">Direct vs Non-direct</p>
      <div className="w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              paddingAngle={4}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Legend formatter={(val) => {
              const item = data.find(d => d.name === val)
              const pct  = item ? Math.round((item.value / total) * 100) : 0
              return `${val} (${pct}%)`
            }} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: unknown) => [String(v), '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
