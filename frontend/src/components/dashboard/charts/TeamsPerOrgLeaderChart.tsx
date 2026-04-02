import VerticalBarChart from './VerticalBarChart'

interface Props {
  data: { name: string; count: number }[]
}

export default function TeamsPerOrgLeaderChart({ data }: Props) {
  return (
    <VerticalBarChart
      data={data}
      xKey="name"
      yKey="count"
      title="Teams per Org Leader"
      color="#003087"
      emptyText="No active reporting lines."
    />
  )
}
