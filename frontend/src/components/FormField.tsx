interface InputProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}

interface SelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
}

const base = 'w-full px-3 py-2 rounded-lg border border-acme-border bg-acme-surface text-acme-text text-sm focus:outline-none focus:ring-2 focus:ring-acme-action'

export function FormInput({ label, value, onChange, type = 'text', required, placeholder }: InputProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-acme-secondary">
      {label}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder} className={base} />
    </label>
  )
}

export function FormSelect({ label, value, onChange, options, required, placeholder }: SelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-acme-secondary">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} required={required} className={base}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
