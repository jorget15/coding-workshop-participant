import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchAchievementsAsync, fetchTeamsAsync } from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import MonthPicker from '../../components/MonthPicker'

export default function AdminAchievementFeed() {
  const dispatch = useDispatch<AppDispatch>()
  const { achievements, teams, loading } = useSelector((s: RootState) => s.teams)
  const [month, setMonth] = useState('')

  useEffect(() => {
    dispatch(fetchAchievementsAsync(undefined))
    dispatch(fetchTeamsAsync())
  }, [dispatch])

  const filtered = achievements.filter(a => !month || a.achievementMonth === month)

  // Group by month
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, a) => {
    const key = a.achievementMonth
    acc[key] = acc[key] ?? []
    acc[key].push(a)
    return acc
  }, {})

  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Achievements</h1>
        <button className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
          + Create Achievement
        </button>
      </div>

      <MonthPicker value={month} onChange={setMonth} label="Filter by month" />

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      {months.map(m => (
        <section key={m}>
          <h2 className="text-acme-heading font-semibold mb-2">{m}</h2>
          <div className="flex flex-col gap-3">
            {grouped[m].map(a => {
              const team = teams.find(t => t._id === a.teamId)
              return <AchievementCard key={a._id} achievement={a} teamName={team?.teamName} />
            })}
          </div>
        </section>
      ))}
      {!loading && months.length === 0 && <p className="text-acme-muted text-sm">No achievements found.</p>}
    </div>
  )
}
