import { statusBadgeClass } from '../lib/helpers'

export function StatusPill({ status }) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'
  return <span className={statusBadgeClass(status)}>{label}</span>
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const toneClasses = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
  }
  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon && (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClasses[tone] || toneClasses.brand}`}>
          <Icon size={22} />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-tight">{value}</p>
        <p className="truncate text-sm text-ink-500">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500/80">{hint}</p>}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, icon: Icon }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-1 rounded-full bg-sand-100 p-3 text-ink-500">
          <Icon size={22} />
        </div>
      )}
      <p className="font-medium text-ink-900">{title}</p>
      {description && <p className="max-w-xs text-sm text-ink-500">{description}</p>}
    </div>
  )
}

export function Alert({ tone = 'brand', children }) {
  const toneClasses = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  }
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${toneClasses[tone]}`}>
      {children}
    </div>
  )
}
