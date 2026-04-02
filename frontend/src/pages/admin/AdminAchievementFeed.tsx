import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchAchievementsAsync, fetchTeamsAsync, createAchievementAsync } from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import MonthPicker from '../../components/MonthPicker'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

const now = new Date()
const DEFAULT_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

export default function AdminAchievementFeed() {
  const dispatch = useDispatch<AppDispatch>()
  const { achievements, teams, loading } = useSelector((s: RootState) => s.teams)
  const [month, setMonth] = useState('')

  const modal = useFormModal(
    { title: '', description: '', team_id: '', scope: 'team', achievement_date: DEFAULT_MONTH },
    createAchievementAsync as Parameters<typeof useFormModal>[1],
    'Achievement created'
  )

  useEffect(() => {
    dispatch(fetchAchievementsAsync(undefined))
    dispatch(fetchTeamsAsync())
  }, [dispatch])

  const filtered = achievements.filter(a => !month || a.achievementMonth === month)

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, a) => {
    const key = a.achievementMonth
    acc[key] = acc[key] ?? []
    acc[key].push(a)
    return acc
  }, {})

  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.title.trim()) { toast.error('Title is required'); return }
    if (modal.form.scope === 'team' && !modal.form.team_id) { toast.error('Select a team'); return }
    const payload = {
      ...modal.form,
      team_id: modal.form.scope === 'team' ? modal.form.team_id : undefined,
    }
    modal.submit(payload)
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Achievements</h1>
        <button onClick={() => modal.setOpen(true)} className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
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

      <FormModal open={modal.open} onClose={modal.reset} title="Create Achievement" submitting={modal.submitting} onSubmit={handleSubmit}>
        <FormInput label="Title *" value={modal.form.title} onChange={v => modal.field('title', v)} required />
        <FormInput label="Description" value={modal.form.description} onChange={v => modal.field('description', v)} />
        <div className="grid grid-cols-2 gap-4">
          <FormSelect label="Scope" value={modal.form.scope} onChange={v => modal.field('scope', v)}
            options={[{ value: 'team', label: 'Team' }, { value: 'org', label: 'Organization-wide' }]} />
          <FormInput label="Month" value={modal.form.achievement_date} onChange={v => modal.field('achievement_date', v)} type="month" />
        </div>
        {modal.form.scope === 'team' && (
          <FormSelect label="Team *" value={modal.form.team_id} onChange={v => modal.field('team_id', v)}
            placeholder="Select team…" options={teams.filter(t => !t.isDeleted).map(t => ({ value: t._id, label: t.teamName }))} />
        )}
      </FormModal>
    </div>
  )
}
