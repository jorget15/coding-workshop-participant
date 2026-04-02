import KPICard from '../KPICard'

interface Props {
  leadersNotCoLocated: number
  globalCoLocationRate: number
  nonDirectLeaders:    number
  highNonDirectRatio:  number
  noReportingLine:     number
}

export default function HealthFlagCards({
  leadersNotCoLocated,
  globalCoLocationRate,
  nonDirectLeaders,
  highNonDirectRatio,
  noReportingLine,
}: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <KPICard
        label="Leaders Not Co-located"
        value={leadersNotCoLocated}
        color={leadersNotCoLocated > 0 ? 'warning' : 'default'}
      />
      <KPICard
        label="Global Co-location"
        value={`${globalCoLocationRate}%`}
        color={globalCoLocationRate < 50 ? 'danger' : globalCoLocationRate < 75 ? 'warning' : 'default'}
      />
      <KPICard
        label="Non-direct Leaders"
        value={nonDirectLeaders}
        color={nonDirectLeaders > 0 ? 'warning' : 'default'}
      />
      <KPICard
        label="> 20% Non-direct"
        value={highNonDirectRatio}
        color={highNonDirectRatio > 0 ? 'warning' : 'default'}
      />
      <KPICard
        label="No Reporting Line"
        value={noReportingLine}
        color={noReportingLine > 0 ? 'danger' : 'default'}
      />
    </div>
  )
}
