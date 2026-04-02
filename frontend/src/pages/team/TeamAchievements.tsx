import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchAchievementsAsync, createAchievementAsync } from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import MonthPicker from '../../components/MonthPicker'
import FormModal from '../../components/FormModal'
import { FormInput } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

const now = new Date()
const DEFAULT_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`

export default function TeamAchievements() {
  const dispatch = useDispatch<AppDispatch>()
  const { achievements, loading } = useSelector((s: RootState) => s.teams)
  const { teamId, role } = useSelector((s: RootState) => s.auth)
  const canEdit = role === 'team_lead' || role === 'system_admin'
  const [month, setMonth] = useState(DEFAULT_MONTH)

  const modal = useFormModal(
    { title: '', description: '', achievement_date: DEFAULT_MONTH },
    createAchievementAsync as Parameters<typeof useFormModal>[1],
    'Achievement created'
  )

  useEffect(() => { dispatch(fetchAchievementsAsync(teamId ?? undefined)) }, [dispatch, teamId])

  const filtered = achievements.filter(a =>
    (teamId ? a.teamId === teamId : true) && (!month || a.achievementMonth === month)
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.title.trim()) { toast.error('Title is required'); return }
    modal.submit({ ...modal.form, team_id: teamId ?? undefined, scope: 'team' })
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Achievements</h1>
        {canEdit && (
          <button onClick={() => modal.setOpen(true)} className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
            + New Achievement
          </button>
        )}
      </div>

      <MonthPicker value={month} onChange={setMonth} label="Month" />

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      {filtered.length === 0
        ? <p className="text-acme-muted text-sm">No achievements for this month.</p>
        : <div className="flex flex-col gap-3">{filtered.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}

      <FormModal open={modal.open} onClose={modal.reset} title="New Achievement" submitting={modal.submitting} onSubmit={handleSubmit}>
        <FormInput label="Title *" value={modal.form.title} onChange={v => modal.field('title', v)} required />
        <FormInput label="Description" value={modal.form.description} onChange={v => modal.field('description', v)} />
        <FormInput label="Month" value={modal.form.achievement_date} onChange={v => modal.field('achievement_date', v)} type="month" />
      </FormModal>
    </div>
  )
}
