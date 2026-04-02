import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

interface Props {
  data: { month: string; count: number }[]
}

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border: '1px solid var(--color-acme-border)',
  borderRadius: '8px',
  fontSize: '12px',
}

export default function AchievementsTrendChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-acme-muted text-sm">No achievements recorded yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-acme-muted text-xs font-medium uppercase tracking-wide">Achievements Trend (last 12 months)</p>
      <div className="w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#0066CC"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Achievements"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
