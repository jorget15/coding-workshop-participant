interface Row {
  id:    string
  name:  string
  teams: string[]
}

interface Props {
  data: Row[]
}

export default function MultiTeamMembersTable({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-acme-muted text-sm">No one is active on multiple teams.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-acme-border text-acme-muted text-left">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Teams</th>
            <th className="pb-2 font-medium text-right">#</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-acme-border">
          {data.map(row => (
            <tr key={row.id}>
              <td className="py-2 text-acme-text font-medium">{row.name}</td>
              <td className="py-2 text-acme-muted max-w-[200px] truncate">{row.teams.join(', ')}</td>
              <td className="py-2 text-acme-action font-semibold text-right">{row.teams.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
