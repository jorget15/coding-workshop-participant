import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export interface VerticalBarChartProps {
  /** Array of data points — must include the keys named in `xKey` and `yKey`. */
  data:       Record<string, string | number>[]
  xKey:       string
  yKey:       string
  title?:     string
  color?:     string
  /** Optional per-bar colors — length must match data length. Overrides `color`. */
  colors?:    string[]
  height?:    number
  emptyText?: string
}

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border:          '1px solid var(--color-acme-border)',
  borderRadius:    '8px',
  fontSize:        '12px',
}

export default function VerticalBarChart({
  data,
  xKey,
  yKey,
  title,
  color     = '#0066CC',
  colors,
  height    = 260,
  emptyText = 'No data.',
}: VerticalBarChartProps) {
  if (data.length === 0) {
    return <p className="text-acme-muted text-sm">{emptyText}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <p className="text-acme-muted text-xs font-medium uppercase tracking-wide">{title}</p>
      )}
      <div className="w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? 'end' : 'middle'}
              interval={0}
              height={data.length > 6 ? 56 : 24}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]}>
              {colors && data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
