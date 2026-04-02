import { useMemo } from 'react'
import type { Team, Individual, Location, Achievement } from '../store/teamSlice'

interface Input {
  teams:        Team[]
  individuals:  Individual[]
  locations:    Location[]
  achievements: Achievement[]
}

export function useMetrics({ teams, individuals, locations, achievements }: Input) {
  const activeTeams  = useMemo(() => teams.filter(t => !t.isDeleted),       [teams])
  const activeIndivs = useMemo(() => individuals.filter(i => !i.isDeleted), [individuals])

  // ── Overview ────────────────────────────────────────────────────────────

  const teamsAtCapacity = useMemo(() =>
    activeTeams.filter(t =>
      t.members.filter(m => m.endDate === null).length === 5
    ).length
  , [activeTeams])

  const achievementsThisMonth = useMemo(() => {
    const current = new Date().toISOString().slice(0, 7)
    return achievements.filter(a => a.achievementMonth === current).length
  }, [achievements])

  // ── Health flags ────────────────────────────────────────────────────────

  const leadersNotCoLocated = useMemo(() =>
    activeTeams.filter(t => {
      const leaderEntry = t.members.find(m => m.memberRole === 'Team Leader' && m.endDate === null)
      if (!leaderEntry) return false
      const person = activeIndivs.find(p => p._id === leaderEntry.personId)
      if (!person) return false
      if (person.assignedOffice) return person.assignedOffice !== t.teamHomeLocation
      const teamLoc = locations.find(l => l._id === t.teamHomeLocation)
      if (!teamLoc) return false
      return person.homeLocation.region !== teamLoc.region
    }).length
  , [activeTeams, activeIndivs, locations])

  const globalCoLocationRate = useMemo(() => {
    let total = 0, colocated = 0
    activeTeams.forEach(t => {
      const teamLoc = locations.find(l => l._id === t.teamHomeLocation)
      t.members.filter(m => m.endDate === null).forEach(m => {
        const person = activeIndivs.find(p => p._id === m.personId)
        total++
        if (!person || !teamLoc) return
        const match = person.assignedOffice
          ? person.assignedOffice === t.teamHomeLocation
          : person.homeLocation.region === teamLoc.region
        if (match) colocated++
      })
    })
    return total > 0 ? Math.round((colocated / total) * 100) : 0
  }, [activeTeams, activeIndivs, locations])

  const nonDirectLeaders = useMemo(() =>
    activeTeams.filter(t =>
      t.members.some(m => m.memberRole === 'Team Leader' && m.endDate === null && m.staffTypeSnapshot === 'non-direct')
    ).length
  , [activeTeams])

  const highNonDirectRatio = useMemo(() =>
    activeTeams.filter(t => {
      const members = t.members.filter(m => m.endDate === null && m.memberRole === 'Member')
      if (!members.length) return false
      return members.filter(m => m.staffTypeSnapshot === 'non-direct').length / members.length > 0.2
    }).length
  , [activeTeams])

  const noReportingLine = useMemo(() =>
    activeTeams.filter(t => !t.reportingHistory.some(r => r.endDate === null)).length
  , [activeTeams])

  // ── Chart data ──────────────────────────────────────────────────────────

  const teamsByRegion = useMemo(() => {
    const counts: Record<string, number> = { NAM: 0, LATAM: 0, EMEA: 0, APAC: 0 }
    activeTeams.forEach(t => {
      const loc = locations.find(l => l._id === t.teamHomeLocation)
      if (loc) counts[loc.region] = (counts[loc.region] ?? 0) + 1
    })
    return Object.entries(counts).map(([region, count]) => ({ region, count }))
  }, [activeTeams, locations])

  const headcountByRegion = useMemo(() => {
    const counts: Record<string, number> = {}
    activeIndivs.forEach(i => {
      const r = i.homeLocation.region
      counts[r] = (counts[r] ?? 0) + 1
    })
    return Object.entries(counts).map(([region, count]) => ({ region, count }))
  }, [activeIndivs])

  const directNonDirect = useMemo(() => {
    const direct    = activeIndivs.filter(i => i.staffType === 'direct').length
    const nonDirect = activeIndivs.filter(i => i.staffType === 'non-direct').length
    return [
      { name: 'Direct',     value: direct },
      { name: 'Non-direct', value: nonDirect },
    ]
  }, [activeIndivs])

  const coLocationPerTeam = useMemo(() =>
    activeTeams.map(t => {
      const teamLoc = locations.find(l => l._id === t.teamHomeLocation)
      const members = t.members.filter(m => m.endDate === null)
      if (!members.length || !teamLoc) return { teamName: t.teamName, rate: 0 }
      const colocated = members.filter(m => {
        const p = activeIndivs.find(i => i._id === m.personId)
        if (!p) return false
        return p.assignedOffice
          ? p.assignedOffice === t.teamHomeLocation
          : p.homeLocation.region === teamLoc.region
      }).length
      return { teamName: t.teamName, rate: Math.round((colocated / members.length) * 100) }
    }).sort((a, b) => b.rate - a.rate)
  , [activeTeams, activeIndivs, locations])

  const achievementsByMonth = useMemo(() => {
    const counts: Record<string, number> = {}
    achievements.forEach(a => {
      counts[a.achievementMonth] = (counts[a.achievementMonth] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, count]) => ({ month, count }))
  }, [achievements])

  const achievementsPerTeam = useMemo(() => {
    const counts: Record<string, number> = {}
    achievements.forEach(a => {
      const key = a.teamId ?? '__org__'
      counts[key] = (counts[key] ?? 0) + 1
    })
    return Object.entries(counts).map(([teamId, count]) => {
      const team = activeTeams.find(t => t._id === teamId)
      return {
        teamName: team?.teamName ?? (teamId === '__org__' ? 'Org-level' : teamId),
        count,
      }
    }).sort((a, b) => b.count - a.count)
  }, [achievements, activeTeams])

  const topTags = useMemo(() => {
    const counts: Record<string, number> = {}
    achievements.forEach(a => a.tags?.forEach(tag => {
      counts[tag] = (counts[tag] ?? 0) + 1
    }))
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }))
  }, [achievements])

  const teamsPerOrgLeader = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {}
    activeTeams.forEach(t => {
      const active = t.reportingHistory.find(r => r.endDate === null)
      if (!active) return
      if (!counts[active.orgLeaderId])
        counts[active.orgLeaderId] = { name: active.orgLeaderName, count: 0 }
      counts[active.orgLeaderId].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count)
  }, [activeTeams])

  const multiTeamMembers = useMemo(() => {
    const map: Record<string, { name: string; teams: string[] }> = {}
    activeTeams.forEach(t => {
      t.members.filter(m => m.endDate === null).forEach(m => {
        if (!map[m.personId]) map[m.personId] = { name: m.personName, teams: [] }
        map[m.personId].teams.push(t.teamName)
      })
    })
    return Object.entries(map)
      .filter(([, v]) => v.teams.length > 1)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.teams.length - a.teams.length)
  }, [activeTeams])

  return {
    activeTeams,
    activeIndivs,
    teamsAtCapacity,
    achievementsThisMonth,
    leadersNotCoLocated,
    globalCoLocationRate,
    nonDirectLeaders,
    highNonDirectRatio,
    noReportingLine,
    teamsByRegion,
    headcountByRegion,
    directNonDirect,
    coLocationPerTeam,
    achievementsByMonth,
    achievementsPerTeam,
    topTags,
    teamsPerOrgLeader,
    multiTeamMembers,
  }
}
