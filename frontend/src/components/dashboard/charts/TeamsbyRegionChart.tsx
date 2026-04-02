import VerticalBarChart from './VerticalBarChart'

interface Props {
  data: { region: string; count: number }[]
}

export default function TeamsbyRegionChart({ data }: Props) {
  return (
    <VerticalBarChart
      data={data}
      xKey="region"
      yKey="count"
      title="Teams by Region"
      color="#0066CC"
      emptyText="No teams found."
    />
  )
}
