import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchIndividualsAsync, fetchTeamsAsync } from '../../store/teamSlice'
import ProfileHeader from '../../components/ProfileHeader'
import { Link } from 'react-router-dom'

export default function AdminIndividualProfile() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const { individuals, teams } = useSelector((s: RootState) => s.teams)

  useEffect(() => {
    dispatch(fetchIndividualsAsync())
    dispatch(fetchTeamsAsync())
  }, [dispatch])

  const person = individuals.find(i => i._id === id)
  if (!person) return <p className="text-acme-muted p-6">Person not found.</p>

  const activeTeams = teams.filter(t =>
    !t.isDeleted && t.members.some(m => m.personId === id && m.endDate === null)
  )

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <ProfileHeader individual={person} />

      <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <span className="text-acme-muted">Staff type</span>
          <span className={`font-medium ${ person.staffType === 'direct' ? 'text-acme-green' : 'text-acme-amber'}`}>{person.staffType}</span>
          <span className="text-acme-muted">Roles</span>
          <div className="flex flex-wrap gap-1">
            {person.roles.map(r => (
              <span key={r} className="px-2 py-0.5 bg-acme-action/10 text-acme-action rounded text-xs font-medium">{r}</span>
            ))}
          </div>
          <span className="text-acme-muted">Created</span>
          <span className="text-acme-text">{person.createdAt?.slice(0,10)}</span>
        </div>
      </div>

      <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Team Memberships</h2>
        {activeTeams.length === 0 ? (
          <p className="text-acme-muted text-sm">Not a member of any active team.</p>
        ) : activeTeams.map(t => {
          const m = t.members.find(m => m.personId === id && m.endDate === null)
          return (
            <div key={t._id} className="flex items-center justify-between">
              <Link to={`/admin/teams/${t._id}`} className="text-acme-action hover:underline text-sm font-medium">{t.teamName}</Link>
              <span className="text-acme-muted text-xs">{m?.memberRole}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
