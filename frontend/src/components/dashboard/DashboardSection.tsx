interface Props {
  title:      string
  children:   React.ReactNode
  className?: string
}

export default function DashboardSection({ title, children, className = '' }: Props) {
  return (
    <section className={`bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-4 ${className}`}>
      <h2 className="text-acme-heading font-semibold text-lg">{title}</h2>
      {children}
    </section>
  )
}
