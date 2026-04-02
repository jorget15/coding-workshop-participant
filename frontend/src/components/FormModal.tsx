import Modal from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  submitting: boolean
  onSubmit: (e: React.FormEvent) => void
  submitLabel?: string
  variant?: 'default' | 'danger'
  children: React.ReactNode
}

export default function FormModal({ open, onClose, title, submitting, onSubmit, submitLabel = 'Create', variant = 'default', children }: Props) {
  const btnClass = variant === 'danger'
    ? 'px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50'
    : 'px-4 py-2 text-sm rounded-lg bg-acme-action text-white font-medium hover:bg-acme-blue transition-colors disabled:opacity-50'
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {children}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-acme-border text-acme-secondary hover:bg-acme-surface transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={btnClass}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
