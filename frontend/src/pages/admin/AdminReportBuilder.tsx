import { useState, useCallback, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { pdf } from '@react-pdf/renderer'
import type { AppDispatch, RootState } from '../../store'
import {
  fetchTeamsAsync, fetchIndividualsAsync,
  fetchLocationsAsync, fetchAchievementsAsync,
} from '../../store/teamSlice'
import { useMetrics } from '../../hooks/useMetrics'
import ReportDocument from '../../components/report/ReportDocument'

export const SECTIONS = [
  { id: 'overview',     label: 'Overview Cards' },
  { id: 'health',       label: 'Team Health Flags' },
  { id: 'distribution', label: 'Teams & Headcount by Region' },
  { id: 'colocation',   label: 'Co-location Rate per Team' },
  { id: 'staffing',     label: 'Direct vs Non-direct' },
  { id: 'achievements', label: 'Achievements Trend & Per Team' },
  { id: 'tags',         label: 'Top Achievement Tags' },
  { id: 'orgleaders',   label: 'Teams per Org Leader' },
  { id: 'multiteam',    label: 'Multi-team Members' },
] as const

export type SectionId = typeof SECTIONS[number]['id']

export default function AdminReportBuilder() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, locations, achievements } = useSelector((s: RootState) => s.teams)
  const { role, teamId: authTeamId } = useSelector((s: RootState) => s.auth)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Which teams are selected (empty = all visible teams)
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  // Which sections to include — all on by default
  const [sections, setSections] = useState<Set<SectionId>>(
    new Set(SECTIONS.map(s => s.id))
  )

  useEffect(() => {
    setLoading(true)
    Promise.all([
      dispatch(fetchTeamsAsync()),
      dispatch(fetchIndividualsAsync()),
      dispatch(fetchLocationsAsync()),
      dispatch(fetchAchievementsAsync(undefined)),
    ]).finally(() => setLoading(false))
  }, [dispatch])

  const metrics = useMetrics({ teams, individuals, locations, achievements })

  // Admins see all active teams; team_lead sees only their own team
  const visibleTeams = role === 'system_admin'
    ? metrics.activeTeams
    : metrics.activeTeams.filter(t => t._id === authTeamId)

  const toggleTeam = (id: string) =>
    setSelectedTeams(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )

  const toggleSection = (id: SectionId) =>
    setSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAllTeams = () =>
    setSelectedTeams(prev => prev.length === visibleTeams.length ? [] : visibleTeams.map(t => t._id))

  const toggleAllSections = () =>
    setSections(prev =>
      prev.size === SECTIONS.length
        ? new Set()
        : new Set(SECTIONS.map(s => s.id))
    )

  const handleDownload = useCallback(async () => {
    setGenerating(true)
    try {
      const blob = await pdf(
        <ReportDocument
          metrics={metrics}
          selectedTeamIds={selectedTeams}
          sections={sections}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `acme-report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(false)
    }
  }, [metrics, selectedTeams, sections])

  if (loading) return <p className="text-acme-muted text-sm p-6">Loading…</p>

  const teamsForDownload = selectedTeams.length ? selectedTeams.length : visibleTeams.length

  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-acme-heading text-2xl font-bold">Report Builder</h1>
        <p className="text-acme-muted text-sm">
          Select which teams and sections to include, then download as PDF.
        </p>
      </div>

      {/* ── Team filter ── */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-acme-heading font-semibold">Teams</h2>
          <button
            onClick={toggleAllTeams}
            className="text-xs text-acme-action hover:underline"
          >
            {selectedTeams.length === visibleTeams.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <p className="text-acme-muted text-xs">
          Leave all unchecked to include all teams.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleTeams.map(t => (
            <label key={t._id} className="flex items-center gap-2 text-sm text-acme-text cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTeams.includes(t._id)}
                onChange={() => toggleTeam(t._id)}
                className="accent-acme-action"
              />
              {t.teamName}
            </label>
          ))}
          {visibleTeams.length === 0 && (
            <p className="text-acme-muted text-sm col-span-2">No teams available.</p>
          )}
        </div>
      </section>

      {/* ── Section picker ── */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-acme-heading font-semibold">Sections</h2>
          <button
            onClick={toggleAllSections}
            className="text-xs text-acme-action hover:underline"
          >
            {sections.size === SECTIONS.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SECTIONS.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-acme-text cursor-pointer">
              <input
                type="checkbox"
                checked={sections.has(s.id)}
                onChange={() => toggleSection(s.id)}
                className="accent-acme-action"
              />
              {s.label}
            </label>
          ))}
        </div>
      </section>

      {/* ── Summary + Download ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <button
          onClick={handleDownload}
          disabled={generating || sections.size === 0 || visibleTeams.length === 0}
          className="px-5 py-2.5 rounded-lg bg-acme-action text-white text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {generating ? 'Generating…' : 'Download PDF'}
        </button>
        {sections.size > 0 && (
          <p className="text-acme-muted text-xs">
            {sections.size} section{sections.size !== 1 ? 's' : ''} ·{' '}
            {teamsForDownload} team{teamsForDownload !== 1 ? 's' : ''}
          </p>
        )}
        {sections.size === 0 && (
          <p className="text-acme-red text-xs">Select at least one section.</p>
        )}
      </div>
    </div>
  )
}
