import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import MonthPicker from '../MonthPicker'
import type { Team, Achievement } from '../../store/teamSlice'

interface Props {
  team:         Team
  achievements: Achievement[]
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function barColor(role: string, rate: number) {
  if (role === 'Team Leader') return '#003087'
  if (rate >= 60) return '#16a34a'
  if (rate >= 30) return '#0066CC'
  return '#d97706'
}

function truncate(name: string, max = 18) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

const tooltipStyle = {
  backgroundColor: 'var(--color-acme-card)',
  border: '1px solid var(--color-acme-border)',
  borderRadius: '8px',
  fontSize: '12px',
}

export default function TeamContributionChart({ team, achievements }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  const { data, poolSize } = useMemo(() => {
    // Achievements pool — this team, this month only
    const pool = achievements.filter(
      a => a.teamId === team._id && a.achievementMonth === selectedMonth
    )

    // Window boundaries
    const [year, month] = selectedMonth.split('-').map(Number)
    const windowStart   = `${selectedMonth}-01`
    const windowEnd     = new Date(year, month, 0).toISOString().slice(0, 10)

    // Roster — everyone active on the team during the selected month
    const roster = team.members.filter(
      m => m.startDate <= windowEnd && (m.endDate === null || m.endDate >= windowStart)
    )

    const rows = roster.map(m => {
      const contributed = pool.filter(a =>
        a.contributors.some(c => c.personId === m.personId)
      ).length
      return {
        personName:  m.personName,
        memberRole:  m.memberRole,
        rate:        pool.length > 0 ? Math.round((contributed / pool.length) * 100) : 0,
        contributed,
      }
    }).sort((a, b) => b.rate - a.rate)

    return { data: rows, poolSize: pool.length }
  }, [team, achievements, selectedMonth])

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <MonthPicker
          label="Month"
          value={selectedMonth}
          onChange={setSelectedMonth}
        />
        <p className="text-acme-muted text-sm pb-2">
          {poolSize} achievement{poolSize !== 1 ? 's' : ''} this month
        </p>
      </div>

      {/* Empty states */}
      {poolSize === 0 && (
        <p className="text-acme-muted text-sm">No achievements recorded for this period.</p>
      )}
      {poolSize > 0 && data.length === 0 && (
        <p className="text-acme-muted text-sm">No members were active during this period.</p>
      )}

      {/* Chart */}
      {poolSize > 0 && data.length > 0 && (
        <div className="w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height={Math.max(200, data.length * 48)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 120, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                dataKey="personName"
                type="category"
                width={115}
                tick={{ fontSize: 12 }}
                tickFormatter={name => truncate(name)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: unknown, _: unknown, entry: any) => [
                  `${value}% (${entry.payload.contributed}/${poolSize} achievements)`,
                  'Contribution',
                ]}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.memberRole, entry.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      {data.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-acme-muted">
          {[
            { color: '#003087', label: 'Team Leader' },
            { color: '#16a34a', label: '≥ 60%' },
            { color: '#0066CC', label: '30–59%' },
            { color: '#d97706', label: '< 30%' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
