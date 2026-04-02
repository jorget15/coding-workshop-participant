import VerticalBarChart from './VerticalBarChart'

interface Props {
  data: { region: string; count: number }[]
}

export default function HeadcountByRegionChart({ data }: Props) {
  return (
    <VerticalBarChart
      data={data}
      xKey="region"
      yKey="count"
      title="Headcount by Region"
      color="#56B4E0"
      emptyText="No individuals found."
    />
  )
}
