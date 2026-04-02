import type { Individual } from '../store/teamSlice'
import Avatar from './Avatar'

interface Props {
  individual: Individual
}

/** Avatar + name + title + email header for a profile page. */
export default function ProfileHeader({ individual }: Props) {
  return (
    <div className="flex items-center gap-5">
      <Avatar name={individual.personName} src={individual.profilePicture} size="lg" />
      <div>
        <h1 className="text-acme-heading text-2xl font-bold">{individual.personName}</h1>
        <p className="text-acme-muted text-sm">{individual.jobTitle}</p>
        <p className="text-acme-action text-sm">{individual.email}</p>
      </div>
    </div>
  )
}
