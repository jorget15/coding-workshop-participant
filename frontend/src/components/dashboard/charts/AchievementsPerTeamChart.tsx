import HorizontalBarChart from './HorizontalBarChart'

interface Props {
  data: { teamName: string; count: number }[]
}

export default function AchievementsPerTeamChart({ data }: Props) {
  return (
    <HorizontalBarChart
      data={data}
      labelKey="teamName"
      valueKey="count"
      title="Achievements per Team"
      color="#56B4E0"
      labelWidth={110}
      emptyText="No achievements recorded yet."
    />
  )
}
