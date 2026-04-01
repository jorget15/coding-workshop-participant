import type { TeamMember } from '../store/teamSlice'

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
  const initials = member.personName.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <tr className="border-b border-acme-border last:border-0">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-acme-action/10 flex items-center justify-center shrink-0">
            <span className="text-acme-action text-xs font-bold">{initials}</span>
          </div>
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
      <td className="py-3 px-4 text-acme-muted text-xs">{member.startDate}</td>
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
