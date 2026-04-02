import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

interface Props {
  data: { tag: string; count: number }[]
}

const COLORS = ['#0066CC', '#56B4E0', '#003087', '#16a34a', '#d97706']

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border: '1px solid var(--color-acme-border)',
  borderRadius: '8px',
  fontSize: '12px',
}

export default function TopTagsChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-acme-muted text-sm">No tags recorded yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-acme-muted text-xs font-medium uppercase tracking-wide">Top Achievement Tags</p>
      <div className="w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" />
            <XAxis
              dataKey="tag"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Uses">
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
