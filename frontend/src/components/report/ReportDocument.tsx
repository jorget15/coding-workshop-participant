import {
  Document, Page, View, Text, StyleSheet, Image,
} from '@react-pdf/renderer'
import type { SectionId } from '../../pages/admin/AdminReportBuilder'
import type { useMetrics } from '../../hooks/useMetrics'

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:      { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a2e' },
  header:    { marginBottom: 20, borderBottom: '1pt solid #e2e8f0', paddingBottom: 12 },
  title:     { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle:  { fontSize: 9, color: '#64748b' },
  h2:        { fontSize: 12, fontWeight: 'bold', marginBottom: 8, marginTop: 16, color: '#0066CC' },
  row:       { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  card:      { flex: 1, minWidth: 80, border: '1pt solid #e2e8f0', borderRadius: 6, padding: 8 },
  cardVal:   { fontSize: 18, fontWeight: 'bold', color: '#0066CC', marginBottom: 2 },
  cardLabel: { fontSize: 8, color: '#64748b' },
  warnVal:   { fontSize: 18, fontWeight: 'bold', color: '#d97706', marginBottom: 2 },
  dangerVal: { fontSize: 18, fontWeight: 'bold', color: '#CC0000', marginBottom: 2 },
  table:     { marginTop: 4 },
  theadRow:  { flexDirection: 'row', borderBottom: '1pt solid #cbd5e1', paddingBottom: 4, marginBottom: 2 },
  th:        { fontSize: 9, fontWeight: 'bold', color: '#64748b', flex: 1 },
  tr:        { flexDirection: 'row', paddingVertical: 3, borderBottom: '0.5pt solid #f1f5f9' },
  td:        { fontSize: 9, flex: 1, color: '#1a1a2e' },
  tdMuted:   { fontSize: 9, flex: 1, color: '#64748b' },
  chartImg:  { width: '100%', marginTop: 8, marginBottom: 4 },
  divider:   { borderBottom: '0.5pt solid #e2e8f0', marginVertical: 8 },
  noData:    { fontSize: 9, color: '#94a3b8', fontStyle: 'italic' },
})

// ── Types ──────────────────────────────────────────────────────────────────

type Metrics = ReturnType<typeof useMetrics>

interface Props {
  metrics:         Metrics
  selectedTeamIds: string[]
  sections:        Set<SectionId>
  /** Base64 PNG data URLs for chart images — provided after html2canvas capture.
   *  Keys match SectionId values. Pass an empty object until charts are built. */
  chartImages?:    Partial<Record<SectionId, string>>
}

// ── Helpers ────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, color = 'default',
}: {
  label: string
  value: string | number
  color?: 'default' | 'warning' | 'danger'
}) {
  const valStyle = color === 'warning' ? s.warnVal : color === 'danger' ? s.dangerVal : s.cardVal
  return (
    <View style={s.card}>
      <Text style={valStyle}>{value}</Text>
      <Text style={s.cardLabel}>{label}</Text>
    </View>
  )
}

// ── Document ───────────────────────────────────────────────────────────────

export default function ReportDocument({
  metrics,
  selectedTeamIds,
  sections,
  chartImages = {},
}: Props) {
  const filteredTeams = selectedTeamIds.length
    ? metrics.activeTeams.filter(t => selectedTeamIds.includes(t._id))
    : metrics.activeTeams

  const filteredAchievements = selectedTeamIds.length
    ? metrics.achievementsPerTeam.filter(row =>
        filteredTeams.some(t => t.teamName === row.teamName) || row.teamName === 'Org-level'
      )
    : metrics.achievementsPerTeam

  const filteredCoLocation = selectedTeamIds.length
    ? metrics.coLocationPerTeam.filter(row =>
        filteredTeams.some(t => t.teamName === row.teamName)
      )
    : metrics.coLocationPerTeam

  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Document
      title="ACME Team Management Report"
      author="ACME Report Builder"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>ACME Team Management</Text>
          <Text style={s.subtitle}>
            Generated {generatedAt} · {filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''}
            {selectedTeamIds.length ? ' (filtered)' : ' (all)'}
          </Text>
        </View>

        {/* ── Overview ── */}
        {sections.has('overview') && (
          <View>
            <Text style={s.h2}>Overview</Text>
            <View style={s.row}>
              <MetricCard label="Active Teams"        value={filteredTeams.length} />
              <MetricCard label="Total Individuals"   value={metrics.activeIndivs.length} />
              <MetricCard label="Achievements / Month" value={metrics.achievementsThisMonth} />
              <MetricCard
                label="Teams at Capacity"
                value={metrics.teamsAtCapacity}
                color={metrics.teamsAtCapacity > 0 ? 'warning' : 'default'}
              />
            </View>
          </View>
        )}

        {/* ── Health Flags ── */}
        {sections.has('health') && (
          <View>
            <Text style={s.h2}>Team Health</Text>
            <View style={s.row}>
              <MetricCard
                label="Leaders Not Co-located"
                value={metrics.leadersNotCoLocated}
                color={metrics.leadersNotCoLocated > 0 ? 'warning' : 'default'}
              />
              <MetricCard
                label="Global Co-location"
                value={`${metrics.globalCoLocationRate}%`}
                color={metrics.globalCoLocationRate < 50 ? 'danger' : metrics.globalCoLocationRate < 75 ? 'warning' : 'default'}
              />
              <MetricCard
                label="Non-direct Leaders"
                value={metrics.nonDirectLeaders}
                color={metrics.nonDirectLeaders > 0 ? 'warning' : 'default'}
              />
              <MetricCard
                label="> 20% Non-direct"
                value={metrics.highNonDirectRatio}
                color={metrics.highNonDirectRatio > 0 ? 'warning' : 'default'}
              />
              <MetricCard
                label="No Reporting Line"
                value={metrics.noReportingLine}
                color={metrics.noReportingLine > 0 ? 'danger' : 'default'}
              />
            </View>
          </View>
        )}

        {/* ── Distribution chart image ── */}
        {sections.has('distribution') && (
          <View>
            <Text style={s.h2}>Distribution</Text>
            {chartImages.distribution
              ? <Image src={chartImages.distribution} style={s.chartImg} />
              : (
                <View>
                  {/* Fallback: text table when chart image not yet available */}
                  <View style={s.table}>
                    <View style={s.theadRow}>
                      <Text style={s.th}>Region</Text>
                      <Text style={s.th}>Teams</Text>
                      <Text style={s.th}>Headcount</Text>
                    </View>
                    {metrics.teamsByRegion.map(row => {
                      const hc = metrics.headcountByRegion.find(h => h.region === row.region)
                      return (
                        <View key={row.region} style={s.tr}>
                          <Text style={s.td}>{row.region}</Text>
                          <Text style={s.td}>{row.count}</Text>
                          <Text style={s.tdMuted}>{hc?.count ?? 0}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )
            }
          </View>
        )}

        {/* ── Co-location ── */}
        {sections.has('colocation') && (
          <View>
            <Text style={s.h2}>Co-location Rate per Team</Text>
            {chartImages.colocation
              ? <Image src={chartImages.colocation} style={s.chartImg} />
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={[s.th, { flex: 3 }]}>Team</Text>
                    <Text style={s.th}>Co-location %</Text>
                  </View>
                  {filteredCoLocation.map(row => (
                    <View key={row.teamName} style={s.tr}>
                      <Text style={[s.td, { flex: 3 }]}>{row.teamName}</Text>
                      <Text style={s.td}>{row.rate}%</Text>
                    </View>
                  ))}
                  {filteredCoLocation.length === 0 && (
                    <Text style={s.noData}>No data available.</Text>
                  )}
                </View>
              )
            }
          </View>
        )}

        {/* ── Staffing mix ── */}
        {sections.has('staffing') && (
          <View>
            <Text style={s.h2}>Staffing Mix</Text>
            {chartImages.staffing
              ? <Image src={chartImages.staffing} style={s.chartImg} />
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={s.th}>Type</Text>
                    <Text style={s.th}>Count</Text>
                  </View>
                  {metrics.directNonDirect.map(row => (
                    <View key={row.name} style={s.tr}>
                      <Text style={s.td}>{row.name}</Text>
                      <Text style={s.td}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              )
            }
          </View>
        )}

        {/* ── Achievements ── */}
        {sections.has('achievements') && (
          <View>
            <Text style={s.h2}>Achievements per Team</Text>
            {chartImages.achievements
              ? <Image src={chartImages.achievements} style={s.chartImg} />
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={[s.th, { flex: 3 }]}>Team</Text>
                    <Text style={s.th}>Count</Text>
                  </View>
                  {filteredAchievements.map(row => (
                    <View key={row.teamName} style={s.tr}>
                      <Text style={[s.td, { flex: 3 }]}>{row.teamName}</Text>
                      <Text style={s.td}>{row.count}</Text>
                    </View>
                  ))}
                  {filteredAchievements.length === 0 && (
                    <Text style={s.noData}>No achievements recorded.</Text>
                  )}
                </View>
              )
            }
          </View>
        )}

        {/* ── Top tags ── */}
        {sections.has('tags') && (
          <View>
            <Text style={s.h2}>Top Achievement Tags</Text>
            {chartImages.tags
              ? <Image src={chartImages.tags} style={s.chartImg} />
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={[s.th, { flex: 3 }]}>Tag</Text>
                    <Text style={s.th}>Uses</Text>
                  </View>
                  {metrics.topTags.map(row => (
                    <View key={row.tag} style={s.tr}>
                      <Text style={[s.td, { flex: 3 }]}>{row.tag}</Text>
                      <Text style={s.td}>{row.count}</Text>
                    </View>
                  ))}
                  {metrics.topTags.length === 0 && (
                    <Text style={s.noData}>No tags recorded.</Text>
                  )}
                </View>
              )
            }
          </View>
        )}

        {/* ── Org leaders ── */}
        {sections.has('orgleaders') && (
          <View>
            <Text style={s.h2}>Teams per Org Leader</Text>
            {chartImages.orgleaders
              ? <Image src={chartImages.orgleaders} style={s.chartImg} />
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={[s.th, { flex: 3 }]}>Leader</Text>
                    <Text style={s.th}>Teams</Text>
                  </View>
                  {metrics.teamsPerOrgLeader.map(row => (
                    <View key={row.name} style={s.tr}>
                      <Text style={[s.td, { flex: 3 }]}>{row.name}</Text>
                      <Text style={s.td}>{row.count}</Text>
                    </View>
                  ))}
                  {metrics.teamsPerOrgLeader.length === 0 && (
                    <Text style={s.noData}>No reporting lines configured.</Text>
                  )}
                </View>
              )
            }
          </View>
        )}

        {/* ── Multi-team members ── */}
        {sections.has('multiteam') && (
          <View>
            <Text style={s.h2}>Multi-team Members</Text>
            {metrics.multiTeamMembers.length === 0
              ? <Text style={s.noData}>No one is active on multiple teams.</Text>
              : (
                <View style={s.table}>
                  <View style={s.theadRow}>
                    <Text style={[s.th, { flex: 2 }]}>Name</Text>
                    <Text style={s.th}>#</Text>
                    <Text style={[s.th, { flex: 4 }]}>Teams</Text>
                  </View>
                  {metrics.multiTeamMembers.map(row => (
                    <View key={row.id} style={s.tr}>
                      <Text style={[s.td, { flex: 2 }]}>{row.name}</Text>
                      <Text style={s.td}>{row.teams.length}</Text>
                      <Text style={[s.tdMuted, { flex: 4 }]}>{row.teams.join(', ')}</Text>
                    </View>
                  ))}
                </View>
              )
            }
          </View>
        )}

        {/* ── Footer ── */}
        <View style={{ marginTop: 24, borderTop: '0.5pt solid #e2e8f0', paddingTop: 8 }}>
          <Text style={{ fontSize: 8, color: '#94a3b8' }}>
            ACME Team Management · Confidential · {generatedAt}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
