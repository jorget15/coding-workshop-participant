import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export interface HorizontalBarChartProps {
  /** Array of data points — must include the keys named in `labelKey` and `valueKey`. */
  data:          Record<string, string | number>[]
  labelKey:      string
  valueKey:      string
  title?:        string
  color?:        string
  /** Optional per-bar color function — receives the value and index, returns a hex string. */
  colorFn?:      (value: number, index: number) => string
  /** Maximum x-axis value. Defaults to 'auto'. */
  xDomain?:      [number, number]
  /** Formatter for x-axis tick labels. */
  xTickFormat?:  (v: number) => string
  /** Formatter for tooltip value. */
  tooltipFormat?: (v: number) => string
  labelWidth?:   number
  emptyText?:    string
}

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border:          '1px solid var(--color-acme-border)',
  borderRadius:    '8px',
  fontSize:        '12px',
}

function truncate(name: string, maxChars: number) {
  return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name
}

export default function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  title,
  color        = '#0066CC',
  colorFn,
  xDomain,
  xTickFormat,
  tooltipFormat,
  labelWidth   = 100,
  emptyText    = 'No data.',
}: HorizontalBarChartProps) {
  if (data.length === 0) {
    return <p className="text-acme-muted text-sm">{emptyText}</p>
  }

  const maxChars = Math.max(8, Math.floor(labelWidth / 7))

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <p className="text-acme-muted text-xs font-medium uppercase tracking-wide">{title}</p>
      )}
      <div className="w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 40, left: labelWidth - 20, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" horizontal={false} />
            <XAxis
              type="number"
              domain={xDomain ?? [0, 'auto']}
              tickFormatter={xTickFormat}
              tick={{ fontSize: 12 }}
              allowDecimals={false}
            />
            <YAxis
              dataKey={labelKey}
              type="category"
              width={labelWidth}
              tick={{ fontSize: 12 }}
              tickFormatter={name => truncate(String(name), maxChars)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={tooltipFormat
                ? ((v: any) => [tooltipFormat(typeof v === 'number' ? v : Number(v ?? 0)), valueKey])
                : undefined
              }
            />
            <Bar dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]}>
              {colorFn && data.map((entry, i) => (
                <Cell key={i} fill={colorFn(Number(entry[valueKey]), i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
