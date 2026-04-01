import type { Region } from '../store/teamSlice'

interface Props {
  city:   string
  region: Region
}

const regionColor: Record<Region, string> = {
  NAM:   'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  LATAM: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  EU:    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  APAC:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
}

/** Colored pill badge showing a city name with its region. */
export default function LocationBadge({ city, region }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${regionColor[region]}`}>
      <span className="opacity-60">{region}</span>
      {city}
    </span>
  )
}
