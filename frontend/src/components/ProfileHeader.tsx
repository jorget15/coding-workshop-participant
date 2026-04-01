import type { Individual } from '../store/teamSlice'

interface Props {
  individual: Individual
}

/** Avatar + name + title + email header for a profile page. */
export default function ProfileHeader({ individual }: Props) {
  const initials = individual.personName
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-acme-action/10 flex items-center justify-center shrink-0">
        <span className="text-acme-action text-xl font-bold">{initials}</span>
      </div>
      <div>
        <h1 className="text-acme-heading text-2xl font-bold">{individual.personName}</h1>
        <p className="text-acme-muted text-sm">{individual.jobTitle}</p>
        <p className="text-acme-action text-sm">{individual.email}</p>
      </div>
    </div>
  )
}
