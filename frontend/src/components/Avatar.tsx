interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
}

export default function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover shrink-0 ${className}`}
      />
    )
  }

  return (
    <div className={`${sizes[size]} rounded-full bg-acme-action/10 flex items-center justify-center shrink-0 ${className}`}>
      <span className="text-acme-action font-bold">{initials}</span>
    </div>
  )
}
