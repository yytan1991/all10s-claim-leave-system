import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X, Play, Pencil, CalendarClock, ChevronDown, ChevronUp, ArrowLeft, MoreVertical } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { RECURRENCE_OPTIONS, formatDate } from '../lib/helpers'

function frequencyLabel(months) {
  return RECURRENCE_OPTIONS.find((o) => o.value === String(months))?.label || `Every ${months} mo`
}

// Computes the billing period label from a start date and how many months
// it covers — e.g. "October 2026" for a single month, or
// "September 2026 - November 2026" for a 3-month (quarterly) period.
// This is always derived automatically; it is never typed manually.
function computePeriodLabel(dateStr, intervalMonths) {
  if (!dateStr) return ''
  const start = new Date(`${dateStr}T00:00:00`)
  const startLabel = start.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  const months = Number(intervalMonths) || 1
  if (months <= 1) return startLabel
  const end = new Date(start)
  end.setMonth(end.getMonth() + months - 1)
  const endLabel = end.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

function RowMenu({ onEdit, onGenerate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = 130
      const openUpward = window.innerHeight - rect.bottom < menuHeight
      setPos({
        top: openUpward ? rect.top - menuHeight : rect.bottom + 4,
        left: rect.right - 160,
      })
    }
    setOpen((o) => !o)
  }

  return (
    <div className="inline-block text-left">
      <button ref={btnRef} onClick={handleToggle} className="text-ink-500 hover:text-ink-900 p-1">
        <MoreVertical size={15} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-40 card py-1 shadow-lg bg-white"
              style={{ top: pos.top, left: pos.left }}
            >
              <button
                onClick={() => {
                  setOpen(false)
                  onEdit()
                }}
                className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-sand-50"
              >
                View / Edit
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onGenerate()
                }}
                className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-sand-50"
              >
                Generate Invoice
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
                className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  )
}

const emptyFilters = {
  studentName: '',
  description: '',
  nextGenFrom: '',
  nextGenTo: '',
  nextInvoiceMonth: '',
  frequency: '',
}

export default function RecurringInvoicePage() {
  const { profile } = useAuth()
  const [plans, setPlans] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'create' | 'edit'
  const [activePlan, setActivePlan] = useState(null)
  const [generatingPlan, setGeneratingPlan] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [bulkEditing, setBulkEditing] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: planData }, { data: studentData }] = await Promise.all([
      supabase
        .from('recurring_invoice_plans')
        .select('*, students(full_name)')
        .eq('org_id', profile.org_id)
        .order('next_generation_date'),
      supabase.from('students').select('id, full_name').eq('org_id', profile.org_id).order('full_name'),
    ])
    setPlans(planData || [])
    setStudents(studentData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function deletePlan(id) {
    if (!confirm('Delete this recurring invoice plan? Already-generated invoices are not affected.')) return
    await supabase.from('recurring_invoice_plans').delete().eq('id', id)
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    load()
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} recurring invoice plan(s)? Already-generated invoices are not affected.`)) return
    await supabase.from('recurring_invoice_plans').delete().in('id', [...selected])
    setSelected(new Set())
    load()
  }

  async function bulkGenerate() {
    if (selected.size === 0) return
    if (!confirm(`Generate an invoice now for ${selected.size} selected plan(s), using each plan's own next generation date?`))
      return
    for (const id of selected) {
      const plan = plans.find((p) => p.id === id)
      if (!plan) continue
      const ok = await generateFromPlan(
        plan,
        plan.next_generation_date,
        computePeriodLabel(plan.next_generation_date, plan.recurrence_interval_months)
      )
      if (ok) {
        const next = new Date(`${plan.next_generation_date}T00:00:00`)
        next.setMonth(next.getMonth() + plan.recurrence_interval_months)
        const nextDateStr = next.toISOString().slice(0, 10)
        await supabase
          .from('recurring_invoice_plans')
          .update({
            next_generation_date: nextDateStr,
            next_invoice_month: computePeriodLabel(nextDateStr, plan.recurrence_interval_months),
          })
          .eq('id', plan.id)
      }
    }
    setSelected(new Set())
    load()
  }

  async function generateFromPlan(plan, invoiceDate, invoiceMonth) {
    const total = (plan.items || []).reduce((s, it) => s + Number(it.amount || 0), 0) || Number(plan.amount || 0)
    const { error: insertError } = await supabase.from('student_invoices').insert({
      org_id: profile.org_id,
      student_id: plan.student_id,
      description: (plan.items && plan.items[0]?.description) || null,
      amount: total,
      subtotal: total,
      due_date: invoiceDate,
      issue_date: invoiceDate,
      invoice_month: invoiceMonth,
      recurrence_interval_months: plan.recurrence_interval_months,
      items: plan.items || [],
      created_by: profile.id,
    })
    if (insertError) {
      alert(`Could not generate invoice: ${insertError.message}`)
      return false
    }
    return true
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === visible.length) setSelected(new Set())
    else setSelected(new Set(visible.map((p) => p.id)))
  }

  function applyFilters() {
    setAppliedFilters(filters)
  }
  function resetFilters() {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
  }

  const visible = plans.filter((p) => {
    const f = appliedFilters
    if (f.studentName && !p.students?.full_name?.toLowerCase().includes(f.studentName.toLowerCase())) return false
    if (f.description) {
      const hay = (p.items || []).map((it) => it.description).join(' ').toLowerCase()
      if (!hay.includes(f.description.toLowerCase())) return false
    }
    if (f.nextGenFrom && p.next_generation_date < f.nextGenFrom) return false
    if (f.nextGenTo && p.next_generation_date > f.nextGenTo) return false
    if (f.nextInvoiceMonth) {
      const label = (p.next_invoice_month || computePeriodLabel(p.next_generation_date, p.recurrence_interval_months)).toLowerCase()
      if (!label.includes(f.nextInvoiceMonth.toLowerCase())) return false
    }
    if (f.frequency && String(p.recurrence_interval_months) !== f.frequency) return false
    return true
  })

  if (view === 'create' || view === 'edit') {
    return (
      <PlanPage
        orgId={profile.org_id}
        createdBy={profile.id}
        students={students}
        plan={view === 'edit' ? activePlan : null}
        onBack={() => setView('list')}
        onSaved={async () => {
          await load()
          setView('list')
        }}
      />
    )
  }

  return (
    <AppLayout title="Recurring Invoices" subtitle="Ongoing billing plans — generate the next invoice whenever it's due.">
      <div className="card mb-4">
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-ink-900"
        >
          Search Filter
          {showFilters ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showFilters && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <input
                className="field-input"
                placeholder="Student Name"
                value={filters.studentName}
                onChange={(e) => setFilters({ ...filters, studentName: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Description"
                value={filters.description}
                onChange={(e) => setFilters({ ...filters, description: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Next Invoice Month"
                value={filters.nextInvoiceMonth}
                onChange={(e) => setFilters({ ...filters, nextInvoiceMonth: e.target.value })}
              />
              <select
                className="field-input"
                value={filters.frequency}
                onChange={(e) => setFilters({ ...filters, frequency: e.target.value })}
              >
                <option value="">Recurrence Frequency Type</option>
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Next Generation Date (from)</label>
                <input
                  type="date"
                  className="field-input"
                  value={filters.nextGenFrom}
                  onChange={(e) => setFilters({ ...filters, nextGenFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Next Generation Date (to)</label>
                <input
                  type="date"
                  className="field-input"
                  value={filters.nextGenTo}
                  onChange={(e) => setFilters({ ...filters, nextGenTo: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={resetFilters} className="btn-secondary text-sm">
                Reset
              </button>
              <button onClick={applyFilters} className="btn-primary text-sm">
                Search
              </button>
            </div>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-500">{selected.size} selected</span>
          <button onClick={() => setBulkEditing(true)} className="btn-secondary text-sm">
            Edit Recurring Invoice(s)
          </button>
          <button onClick={bulkGenerate} className="btn-secondary text-sm">
            Generate Invoice(s)
          </button>
          <button onClick={bulkDelete} className="text-rose-600 border border-rose-200 hover:bg-rose-50 text-sm rounded-md px-3 py-1.5 font-medium">
            Delete Selected Recurring Invoice(s)
          </button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setView('create')}
          className="btn-primary text-sm"
          disabled={students.length === 0}
        >
          <Plus size={15} /> New recurring invoice
        </button>
      </div>
      {students.length === 0 && <Alert tone="amber">Add students on the Students page first.</Alert>}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No recurring invoices found" description="Try clearing filters, or create your first plan above." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={selected.size === visible.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-3 font-medium">Student Name</th>
                  <th className="px-4 py-3 font-medium min-w-[200px]">Description</th>
                  <th className="px-4 py-3 font-medium">Total Amount</th>
                  <th className="px-4 py-3 font-medium">Frequency</th>
                  <th className="px-4 py-3 font-medium">Next Generation Date</th>
                  <th className="px-4 py-3 font-medium">Next Invoice Month</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {visible.map((p) => {
                  const total = (p.items || []).reduce((s, it) => s + Number(it.amount || 0), 0) || Number(p.amount || 0)
                  const desc = (p.items || []).map((it) => it.description).filter(Boolean).join(', ')
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-3 align-top">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                      </td>
                      <td className="px-4 py-3 align-top font-medium text-ink-900 whitespace-nowrap">{p.students?.full_name}</td>
                      <td className="px-4 py-3 align-top text-ink-700 whitespace-normal min-w-[200px] max-w-[320px]">{desc || '—'}</td>
                      <td className="px-4 py-3 align-top text-ink-700 whitespace-nowrap">RM {total.toFixed(2)}</td>
                      <td className="px-4 py-3 align-top text-ink-700 whitespace-nowrap">{frequencyLabel(p.recurrence_interval_months)}</td>
                      <td className="px-4 py-3 align-top text-ink-700 whitespace-nowrap">{formatDate(p.next_generation_date)}</td>
                      <td className="px-4 py-3 align-top text-ink-700 whitespace-nowrap">
                        {p.next_invoice_month || computePeriodLabel(p.next_generation_date, p.recurrence_interval_months)}
                      </td>
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        <RowMenu
                          onEdit={() => {
                            setActivePlan(p)
                            setView('edit')
                          }}
                          onGenerate={() => setGeneratingPlan(p)}
                          onDelete={() => deletePlan(p.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {generatingPlan && (
        <GenerateInvoiceModal
          plan={generatingPlan}
          onClose={() => setGeneratingPlan(null)}
          onGenerate={async (invoiceDate, invoiceMonth, nextGenDate, nextInvoiceMonthVal) => {
            const ok = await generateFromPlan(generatingPlan, invoiceDate, invoiceMonth)
            if (!ok) return
            await supabase
              .from('recurring_invoice_plans')
              .update({ next_generation_date: nextGenDate, next_invoice_month: nextInvoiceMonthVal })
              .eq('id', generatingPlan.id)
            setGeneratingPlan(null)
            await load()
          }}
        />
      )}

      {bulkEditing && (
        <BulkEditModal
          count={selected.size}
          onClose={() => setBulkEditing(false)}
          onSaved={async (patch) => {
            await supabase.from('recurring_invoice_plans').update(patch).in('id', [...selected])
            setBulkEditing(false)
            setSelected(new Set())
            await load()
          }}
        />
      )}
    </AppLayout>
  )
}

function ItemsEditor({ items, setItems }) {
  function addItem() {
    setItems([...items, { description: '', amount: '' }])
  }
  function updateItem(i, field, value) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)))
  }
  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }
  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0)
  return (
    <div>
      <label className="field-label mb-2 block">Billing (description + amount)</label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="field-input flex-1"
              placeholder="Description"
              value={it.description}
              onChange={(e) => updateItem(i, 'description', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="field-input w-32"
              placeholder="RM"
              value={it.amount}
              onChange={(e) => updateItem(i, 'amount', e.target.value)}
            />
            <button type="button" onClick={() => removeItem(i)} className="text-rose-500 px-1">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="btn-secondary text-xs mt-2">
        <Plus size={12} /> Add line
      </button>
      <div className="flex justify-between items-center pt-3 mt-3 border-t border-sand-200">
        <span className="text-sm font-semibold text-ink-900">Total</span>
        <span className="text-lg font-semibold text-ink-900">RM {total.toFixed(2)}</span>
      </div>
    </div>
  )
}


function PlanPage({ orgId, createdBy, students, plan, onBack, onSaved }) {
  const isEdit = Boolean(plan)
  const [studentId, setStudentId] = useState(plan?.student_id || students[0]?.id || '')
  const [items, setItems] = useState(plan?.items?.length ? plan.items : [{ description: '', amount: '' }])
  const [recurrence, setRecurrence] = useState(String(plan?.recurrence_interval_months || 1))
  const [nextGenerationDate, setNextGenerationDate] = useState(
    plan?.next_generation_date || new Date().toISOString().slice(0, 10)
  )
  const [nextInvoiceMonth, setNextInvoiceMonth] = useState(
    plan?.next_invoice_month || computePeriodLabel(plan?.next_generation_date || new Date().toISOString().slice(0, 10), plan?.recurrence_interval_months || 1)
  )
  const [monthEdited, setMonthEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0)

  function handleDateChange(value) {
    setNextGenerationDate(value)
    if (!monthEdited) setNextInvoiceMonth(computePeriodLabel(value, recurrence))
  }
  function handleRecurrenceChange(value) {
    setRecurrence(value)
    if (!monthEdited) setNextInvoiceMonth(computePeriodLabel(nextGenerationDate, value))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const cleanItems = items.filter((it) => it.description.trim() || Number(it.amount) > 0)
    if (!studentId || cleanItems.length === 0 || !nextGenerationDate) {
      setError('Pick a student, add at least one billing line, and set a next generation date.')
      return
    }
    setSaving(true)

    const payload = {
      org_id: orgId,
      student_id: studentId,
      items: cleanItems,
      amount: total,
      recurrence_interval_months: Number(recurrence),
      next_generation_date: nextGenerationDate,
      next_invoice_month: nextInvoiceMonth,
    }

    const { data: savedRows, error: saveError } = isEdit
      ? await supabase.from('recurring_invoice_plans').update(payload).eq('id', plan.id).select()
      : await supabase.from('recurring_invoice_plans').insert({ ...payload, created_by: createdBy }).select()

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    if (!savedRows || savedRows.length === 0) {
      setError(
        'The save did not apply — the database returned no updated row. This usually means a permissions rule blocked it. Nothing was changed; please try again or check with support.'
      )
      return
    }
    onSaved()
  }

  return (
    <AppLayout title="" subtitle="">
      <nav className="text-sm mb-2">
        <button onClick={onBack} className="text-brand-600 hover:underline">
          Recurring Invoices
        </button>
        <span className="text-ink-400"> / {isEdit ? 'View and Edit Recurring Invoice' : 'New Recurring Invoice'}</span>
      </nav>
      <h1 className="text-lg font-semibold text-ink-900 uppercase tracking-wide mb-6">
        {isEdit ? `Recurring Invoice - ${plan.students?.full_name || ''}` : 'New Recurring Invoice'}
      </h1>

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {error && <Alert tone="rose">{error}</Alert>}

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-ink-900 text-sm">Student</h3>
          <select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={isEdit}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-4">Billing</h3>
          <ItemsEditor items={items} setItems={setItems} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-ink-900 text-sm">Schedule</h3>
          <div>
            <label className="field-label">Frequency</label>
            <select className="field-input" value={recurrence} onChange={(e) => handleRecurrenceChange(e.target.value)}>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Next generation date</label>
              <input
                type="date"
                className="field-input"
                value={nextGenerationDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Next invoice month</label>
              <input
                className="field-input"
                value={nextInvoiceMonth}
                onChange={(e) => {
                  setMonthEdited(true)
                  setNextInvoiceMonth(e.target.value)
                }}
              />
            </div>
          </div>
          <p className="text-xs text-ink-500">
            Suggested automatically from the date and frequency above — edit it if the actual billing
            period doesn't line up with calendar months.
          </p>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
          </button>
          <button type="button" onClick={onBack} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </AppLayout>
  )
}

// Lets admin confirm/adjust the actual date being generated now; the invoice
// month is always derived from that date automatically, never typed.
function GenerateInvoiceModal({ plan, onClose, onGenerate }) {
  const [invoiceDate, setInvoiceDate] = useState(plan.next_generation_date)
  const [invoiceMonth, setInvoiceMonth] = useState(computePeriodLabel(plan.next_generation_date, plan.recurrence_interval_months))
  const [monthEdited, setMonthEdited] = useState(false)
  const [nextGenDate, setNextGenDate] = useState(() => {
    const d = new Date(`${plan.next_generation_date}T00:00:00`)
    d.setMonth(d.getMonth() + plan.recurrence_interval_months)
    return d.toISOString().slice(0, 10)
  })
  const [nextInvoiceMonthVal, setNextInvoiceMonthVal] = useState(() => {
    const d = new Date(`${plan.next_generation_date}T00:00:00`)
    d.setMonth(d.getMonth() + plan.recurrence_interval_months)
    return computePeriodLabel(d.toISOString().slice(0, 10), plan.recurrence_interval_months)
  })
  const [nextMonthEdited, setNextMonthEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleInvoiceDateChange(value) {
    setInvoiceDate(value)
    if (!monthEdited) setInvoiceMonth(computePeriodLabel(value, plan.recurrence_interval_months))
  }
  function handleNextGenDateChange(value) {
    setNextGenDate(value)
    if (!nextMonthEdited) setNextInvoiceMonthVal(computePeriodLabel(value, plan.recurrence_interval_months))
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setSaving(true)
    await onGenerate(invoiceDate, invoiceMonth, nextGenDate, nextInvoiceMonthVal)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Generate invoice · {plan.students?.full_name}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="border-b border-sand-200 pb-4">
            <p className="text-xs font-semibold text-ink-500 uppercase mb-2">This invoice</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Invoice date</label>
                <input type="date" className="field-input" value={invoiceDate} onChange={(e) => handleInvoiceDateChange(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Invoice month</label>
                <input
                  className="field-input"
                  value={invoiceMonth}
                  onChange={(e) => {
                    setMonthEdited(true)
                    setInvoiceMonth(e.target.value)
                  }}
                />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase mb-2">After generating, set next to</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Next generation date</label>
                <input type="date" className="field-input" value={nextGenDate} onChange={(e) => handleNextGenDateChange(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Next invoice month</label>
                <input
                  className="field-input"
                  value={nextInvoiceMonthVal}
                  onChange={(e) => {
                    setNextMonthEdited(true)
                    setNextInvoiceMonthVal(e.target.value)
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Generating…' : 'Generate invoice'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BulkEditModal({ count, onClose, onSaved }) {
  const [recurrence, setRecurrence] = useState('')
  const [nextGenDate, setNextGenDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const patch = {}
    if (recurrence) patch.recurrence_interval_months = Number(recurrence)
    if (nextGenDate) {
      patch.next_generation_date = nextGenDate
      patch.next_invoice_month = computePeriodLabel(nextGenDate, recurrence || 1)
    }
    await onSaved(patch)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Edit {count} recurring invoice(s)</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-500 mb-4">Leave a field blank to leave it unchanged for the selected plans.</p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="field-label">New frequency (optional)</label>
            <select className="field-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="">— No change —</option>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">New next generation date (optional)</label>
            <input type="date" className="field-input" value={nextGenDate} onChange={(e) => setNextGenDate(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Apply to selected'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
