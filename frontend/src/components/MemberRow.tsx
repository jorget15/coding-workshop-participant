import type { Individual, TeamMember } from '../store/teamSlice'
import { formatDate } from '../utils/formatDate'
import Avatar from './Avatar'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'

interface Props {
  member:       TeamMember
  /** If provided, renders action buttons (team lead / admin only). */
  onRemove?:    (personId: string) => void
  onDelegate?:  (personId: string) => void
}

const roleBadge: Record<string, string> = {
  'Team Leader': 'bg-acme-blue/10 text-acme-blue',
  'Member':      'bg-acme-muted/10 text-acme-muted',
  'Delegate':    'bg-acme-light/10 text-acme-light',
}

/** Single row in a members table. */
export default function MemberRow({ member, onRemove, onDelegate }: Props) {
  const individuals = useSelector((s: RootState) => s.teams.individuals) as Individual[]
  const person = individuals.find(i => i._id === member.personId)

  return (
    <tr className="border-b border-acme-border last:border-0">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Avatar name={member.personName} src={person?.profilePicture} size="sm" />
          <span className="text-acme-heading font-medium text-sm">{member.personName}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${roleBadge[member.memberRole] ?? 'bg-acme-muted/10 text-acme-muted'}`}>
          {member.memberRole}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex px-2 py-0.5 rounded text-xs ${member.staffTypeSnapshot === 'direct' ? 'bg-acme-green/10 text-acme-green' : 'bg-acme-amber/10 text-acme-amber'}`}>
          {member.staffTypeSnapshot}
        </span>
      </td>
      <td className="py-3 px-4 text-acme-muted text-xs">{formatDate(member.startDate)}</td>
      {(onRemove || onDelegate) && (
        <td className="py-3 px-4">
          <div className="flex gap-2">
            {onDelegate && member.memberRole === 'Member' && (
              <button
                onClick={() => onDelegate(member.personId)}
                className="text-xs text-acme-action hover:underline"
              >
                Make Delegate
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(member.personId)}
                className="text-xs text-acme-red hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}
