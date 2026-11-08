import { RECURRENCE_OPTIONS, toISODate } from '../lib/helpers'

// "October 2026" for one month, or "October 2026 - February 2027" for a longer period
function periodLabel(dateStr, months) {
  const start = new Date(`${dateStr}T00:00:00`)
  const startLabel = start.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  if (months <= 1) return startLabel
  const end = new Date(start)
  end.setMonth(end.getMonth() + months - 1)
  return `${startLabel} - ${end.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}`
}

// The small "how often to invoice" dropdown shown beside a newly ticked lesson.
// value: '' (no invoice), a preset ('1', '3', '6', '12') or 'custom'. Choosing Custom reveals a box for the
// number of months and shows the starting and ending month it works out to.
export default function FrequencyPicker({ value, customMonths, onChange, onCustomChange, selectClass = 'w-36' }) {
  const months = Math.floor(Number(customMonths)) || 0
  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2">
        <select className={`field-input text-xs py-1 ${selectClass}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No invoice</option>
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {value === 'custom' && (
          <>
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              className="field-input text-xs py-1 w-16"
              value={customMonths}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="e.g. 5"
              autoFocus
            />
            <span className="text-xs text-ink-500">months</span>
          </>
        )}
      </div>
      {value === 'custom' && months >= 1 && months <= 120 && (
        <p className="text-[11px] text-ink-500 mt-1" data-testid="custom-period">
          {periodLabel(toISODate(new Date()), months)}
        </p>
      )}
    </div>
  )
}
