import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchAchievementsAsync } from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import MonthPicker from '../../components/MonthPicker'

export default function TeamAchievements() {
  const dispatch = useDispatch<AppDispatch>()
  const { achievements, loading } = useSelector((s: RootState) => s.teams)
  const { teamId, role } = useSelector((s: RootState) => s.auth)
  const canEdit = role === 'team_lead' || role === 'system_admin'

  const now    = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`)

  useEffect(() => { dispatch(fetchAchievementsAsync(teamId ?? undefined)) }, [dispatch, teamId])

  const filtered = achievements.filter(a =>
    (teamId ? a.teamId === teamId : true) && (!month || a.achievementMonth === month)
  )

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Achievements</h1>
        {canEdit && (
          <button className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
            + New Achievement
          </button>
        )}
      </div>

      <MonthPicker value={month} onChange={setMonth} label="Month" />

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      {filtered.length === 0
        ? <p className="text-acme-muted text-sm">No achievements for this month.</p>
        : <div className="flex flex-col gap-3">{filtered.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}
    </div>
  )
}
