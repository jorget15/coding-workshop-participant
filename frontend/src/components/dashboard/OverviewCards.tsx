import KPICard from '../KPICard'

interface Props {
  totalTeams:             number
  totalIndividuals:       number
  achievementsThisMonth:  number
  teamsAtCapacity:        number
}

export default function OverviewCards({
  totalTeams,
  totalIndividuals,
  achievementsThisMonth,
  teamsAtCapacity,
}: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard label="Active Teams"          value={totalTeams} />
      <KPICard label="Individuals"           value={totalIndividuals} />
      <KPICard label="Achievements / Month"  value={achievementsThisMonth} />
      <KPICard
        label="Teams at Capacity"
        value={teamsAtCapacity}
        color={teamsAtCapacity > 0 ? 'warning' : 'default'}
      />
    </div>
  )
}
