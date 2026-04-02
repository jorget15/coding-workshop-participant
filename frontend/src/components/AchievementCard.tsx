import type { Achievement } from '../store/teamSlice'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { formatMonth } from './MonthPicker'

interface Props {
  achievement: Achievement
  teamName?:   string
  onEdit?:     (id: string) => void
}

/** Card in an achievement feed. */
export default function AchievementCard({ achievement, teamName, onEdit }: Props) {
  return (
    <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-acme-heading font-semibold text-base">{achievement.achievementTitle}</h3>
            {teamName && (
              <Link
                to={`/admin/teams/${achievement.teamId}`}
                className="text-xs text-acme-action hover:underline"
              >
                {teamName}
              </Link>
            )}
            <span className="text-xs text-acme-muted">{formatMonth(achievement.achievementMonth)}</span>
          </div>
          <p className="text-acme-text text-sm">{achievement.achievementDescription}</p>
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(achievement._id)}
            className="text-xs text-acme-action hover:underline shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      {achievement.impactMetric && (
        <p className="bg-acme-action/5 border border-acme-action/20 rounded-lg px-4 py-2 text-sm font-medium text-acme-action">
          {achievement.impactMetric}
        </p>
      )}

      {achievement.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {achievement.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-acme-surface rounded-full text-xs text-acme-muted">
              {tag}
            </span>
          ))}
        </div>
      )}

      {achievement.contributors.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {achievement.contributors.slice(0, 5).map(c => (
                <div key={c.personId} title={c.personName} className="border-2 border-acme-card rounded-full">
                  <Avatar name={c.personName} size="xs" />
                </div>
            ))}
          </div>
          <span className="text-acme-muted text-xs">{achievement.contributors.length} contributor{achievement.contributors.length > 1 ? 's' : ''}</span>
        </div>
      )}

      {achievement.proofLink && (
        <a
          href={achievement.proofLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-acme-action hover:underline"
        >
          View proof →
        </a>
      )}
    </div>
  )
}
