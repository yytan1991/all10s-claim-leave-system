import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Receipt } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toISODate, RECURRENCE_OPTIONS } from '../lib/helpers'

// Same period wording as the rest of the system, e.g. "October 2026" or "October 2026 - December 2026"
function periodLabel(dateStr, intervalMonths) {
  const start = new Date(`${dateStr}T00:00:00`)
  const startLabel = start.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  const months = Number(intervalMonths) || 1
  if (months <= 1) return startLabel
  const end = new Date(start)
  end.setMonth(end.getMonth() + months - 1)
  return `${startLabel} - ${end.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}`
}

// Shown right after a student is enrolled in a lesson that has a fee but no recurring invoice yet,
// so the invoice isn't forgotten.
//   items: [{ studentId, studentName, lessonId, lessonName, fee }]
//   onDone: called when the window is closed, whether invoices were created or skipped
export default function BillingPromptModal({ items, orgId, createdBy, onDone }) {
  const defaultMonths = String((RECURRENCE_OPTIONS.find((o) => Number(o.value) === 1) || RECURRENCE_OPTIONS[0]).value)
  const keyOf = (it) => `${it.studentId}:${it.lessonId}`

  const [included, setIncluded] = useState(() => new Set(items.map(keyOf)))
  const [months, setMonths] = useState(() => Object.fromEntries(items.map((it) => [keyOf(it), defaultMonths])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(key) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleCreate() {
    setError('')
    const chosen = items.filter((it) => included.has(keyOf(it)))
    if (chosen.length === 0) {
      onDone()
      return
    }
    setSaving(true)
    const today = toISODate(new Date())
    const rows = chosen.map((it) => {
      const m = months[keyOf(it)]
      return {
        org_id: orgId,
        student_id: it.studentId,
        items: [{ description: it.lessonName, amount: it.fee }],
        amount: it.fee,
        recurrence_interval_months: Number(m),
        next_generation_date: today,
        next_invoice_month: periodLabel(today, m),
        created_by: createdBy,
      }
    })
    const { error: insertError } = await supabase.from('recurring_invoice_plans').insert(rows)
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onDone()
  }

  const selectedCount = items.filter((it) => included.has(keyOf(it))).length

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <span className="h-10 w-10 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center">
            <Receipt size={18} />
          </span>
          <div>
            <h3 className="font-semibold text-ink-900">Set up recurring invoices?</h3>
            <p className="text-sm text-ink-500 mt-0.5">
              {items.length === 1 ? 'This student was' : 'These students were'} just enrolled in {items.length === 1 ? 'a lesson' : 'lessons'} with a fee but
              {items.length === 1 ? " doesn't" : " don't"} have a recurring invoice for {items.length === 1 ? 'it' : 'them'} yet.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2 mb-3">{error}</p>}

        <div className="space-y-2 mb-4">
          {items.map((it) => {
            const key = keyOf(it)
            const on = included.has(key)
            return (
              <div key={key} className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 ${on ? 'border-brand-600/40 bg-brand-50/40' : 'border-sand-200'}`}>
                <label className="flex items-center gap-3 flex-1 min-w-[12rem] cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900 truncate">{it.studentName}</span>
                    <span className="block text-xs text-ink-500">
                      {it.lessonName} · RM {Number(it.fee).toFixed(2)}
                    </span>
                  </span>
                </label>
                <select
                  className="field-input text-sm py-1.5 w-44"
                  value={months[key]}
                  disabled={!on}
                  onChange={(e) => setMonths((prev) => ({ ...prev, [key]: e.target.value }))}
                >
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-ink-500 mb-4">
          The first invoice is created today and then repeats automatically. You can change or remove any of these later under Recurring Invoice.
        </p>

        <div className="flex gap-3">
          <button onClick={handleCreate} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : selectedCount > 0 ? `Create recurring invoice${selectedCount === 1 ? '' : 's'}` : 'Continue'}
          </button>
          <button onClick={onDone} disabled={saving} className="btn-secondary">
            Skip for now
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
