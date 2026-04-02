import type { Team, Location } from '../store/teamSlice'
import CapIndicator from './CapIndicator'
import RatioBadge from './RatioBadge'
import LocationBadge from './LocationBadge'
import { Link } from 'react-router-dom'

interface Props {
  team:      Team
  locations: Location[]
  basePath?: string  // '/admin/teams' or '/teams'
}

/** Compact team summary card with KPI badges. */
export default function TeamCard({ team, locations, basePath = '/admin/teams' }: Props) {
  const activeMembers = team.members.filter(m => m.endDate === null && m.memberRole === 'Member')
  const allActive     = team.members.filter(m => m.endDate === null)
  const nonDirect     = allActive.filter(m => m.staffTypeSnapshot === 'non-direct')
  const ratio         = allActive.length ? nonDirect.length / allActive.length : 0
  const leader        = team.members.find(m => m.memberRole === 'Team Leader' && m.endDate === null)
  const loc           = locations.find(l => l._id === team.teamHomeLocation)

  return (
    <Link
      to={`${basePath}/${team._id}`}
      className="block bg-acme-card border border-acme-border rounded-xl p-5 hover:border-acme-action transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-acme-heading font-semibold text-base leading-tight">{team.teamName}</h3>
        {loc && <LocationBadge city={loc.city} region={loc.region} />}
      </div>

      {leader && (
        <p className="text-acme-muted text-xs mb-3">
          Leader: <span className="text-acme-text font-medium">{leader.personName}</span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <CapIndicator active={activeMembers.length} />
        <RatioBadge ratio={ratio} />
      </div>
    </Link>
  )
}
