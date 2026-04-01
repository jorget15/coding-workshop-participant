import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchAchievementsAsync } from '../store/teamSlice'
import AchievementCard from '../components/AchievementCard'
import MonthPicker from '../components/MonthPicker'

/** Shared read-only achievement feed for editor / viewer / non-direct roles.
 *  Shows own team achievements + achievements from teams with overlapping members. */
export default function AchievementFeed() {
  const dispatch = useDispatch<AppDispatch>()
  const { achievements, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`)
  const [scope, setScope] = useState<'all'|'own'>('all')

  useEffect(() => { dispatch(fetchAchievementsAsync(undefined)) }, [dispatch])

  const filtered = achievements.filter(a => {
    const matchMonth = !month || a.achievementMonth === month
    const matchScope = scope === 'own' ? a.teamId === teamId : true
    return matchMonth && matchScope
  })

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <h1 className="text-acme-heading text-2xl font-bold">Achievements</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <MonthPicker value={month} onChange={setMonth} label="Month" />
        <div className="flex gap-2">
          {(['all','own'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                scope === s ? 'bg-acme-action text-white border-acme-action' : 'bg-acme-card text-acme-muted border-acme-border hover:border-acme-action'
              }`}
            >{s === 'own' ? 'My team only' : 'All visible'}</button>
          ))}
        </div>
      </div>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      {filtered.length === 0
        ? <p className="text-acme-muted text-sm">No achievements for this selection.</p>
        : <div className="flex flex-col gap-3">{filtered.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}
    </div>
  )
}
