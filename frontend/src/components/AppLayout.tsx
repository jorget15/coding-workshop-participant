import Sidebar from './Sidebar'

interface Props { children: React.ReactNode }

/** Full-height layout: Sidebar on the left, scrollable main content on the right. */
export default function AppLayout({ children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-acme-surface dark:bg-acme-surface">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
