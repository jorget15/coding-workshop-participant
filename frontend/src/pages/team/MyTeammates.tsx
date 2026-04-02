import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchIndividualsAsync } from '../../store/teamSlice'
import Avatar from '../../components/Avatar'

export default function MyTeammates() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchIndividualsAsync())
  }, [dispatch])

  const team    = teams.find(t => t._id === teamId)
  const members = team ? team.members.filter(m => m.endDate === null) : []

  const selectedPerson  = selected ? individuals.find(i => i._id === selected) : null
  const selectedMember  = selected ? members.find(m => m.personId === selected) : null
  // Individual now has homeLocation directly — no locations lookup needed

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <h1 className="text-acme-heading text-2xl font-bold">My Teammates</h1>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {members.map(m => {
          const person = individuals.find(i => i._id === m.personId)
          const loc    = person?.homeLocation ?? null
          return (
            <button
              key={m.personId}
              onClick={() => setSelected(m.personId === selected ? null : m.personId)}
              className={`bg-acme-card border rounded-xl p-4 flex flex-col items-center gap-2 text-center transition-colors ${
                selected === m.personId ? 'border-acme-action' : 'border-acme-border hover:border-acme-action'
              }`}
            >
              <Avatar name={m.personName} src={person?.profilePicture} />
              <p className="text-acme-heading font-medium text-sm">{m.personName}</p>
              {person && <p className="text-acme-muted text-xs">{person.jobTitle}</p>}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                m.memberRole === 'Team Leader' ? 'bg-acme-blue/10 text-acme-blue' :
                m.memberRole === 'Delegate'    ? 'bg-acme-light/10 text-acme-light' :
                'bg-acme-muted/10 text-acme-muted'
              }`}>{m.memberRole}</span>
              {loc && <span className="text-acme-muted text-xs">{loc.city}, {loc.country}</span>}
            </button>
          )
        })}
      </div>

      {/* Mini profile modal */}
      {selectedPerson && selectedMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-acme-card border border-acme-border rounded-2xl p-6 max-w-sm w-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <Avatar name={selectedPerson.personName} src={selectedPerson.profilePicture} size="lg" />
              <div>
                <p className="text-acme-heading font-bold">{selectedPerson.personName}</p>
                <p className="text-acme-muted text-sm">{selectedPerson.jobTitle}</p>
                <p className="text-acme-action text-sm">{selectedPerson.email}</p>
              </div>
            </div>
            <div className="border-t border-acme-border pt-3 grid grid-cols-2 gap-2 text-sm">
              <span className="text-acme-muted">Role on team</span>
              <span className="text-acme-text font-medium">{selectedMember.memberRole}</span>
              {selectedPerson.homeLocation && <>
                <span className="text-acme-muted">Location</span>
                <span className="text-acme-text">{selectedPerson.homeLocation.city}, {selectedPerson.homeLocation.country}</span>
              </>}
            </div>
            <button onClick={() => setSelected(null)} className="text-acme-muted text-sm hover:underline self-end mt-1">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
