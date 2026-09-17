import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Wallet, Trash2, Pencil, X, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState, StatCard } from '../components/UI'
import { formatDate, formatMoney, getMonthGrid, toISODate } from '../lib/helpers'

const RECURRENCE_OPTIONS = [
  { value: '', label: 'One-time (no repeat)' },
  { value: '1', label: 'Monthly' },
  { value: '3', label: 'Every 3 months' },
  { value: '6', label: 'Every 6 months' },
  { value: '12', label: 'Every 12 months' },
]

function isOverdueEntry(entry) {
  return entry.status === 'expected' && entry.due_date < toISODate(new Date())
}

export default function CashFlow() {
  const { profile } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState(today.getMonth())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [formEntry, setFormEntry] = useState(null) // null = closed, {} = new, {...entry} = edit
  const [error, setError] = useState('')

  const weeks = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex])
  const rangeStart = weeks[0][0]
  const rangeEnd = weeks[weeks.length - 1][6]

  useEffect(() => {
    if (profile) load()
    setSelectedDate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex, profile?.org_id])

  async function load() {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('cashflow_entries')
      .select('*')
      .eq('org_id', profile.org_id)
      .gte('due_date', toISODate(rangeStart))
      .lte('due_date', toISODate(rangeEnd))
      .order('due_date')
    if (fetchError) setError(fetchError.message)
    setEntries(data || [])
    setLoading(false)
  }

  function entriesForDay(date) {
    const iso = toISODate(date)
    return entries.filter((e) => e.due_date === iso)
  }

  async function markStatus(entry, status) {
    await supabase.from('cashflow_entries').update({ status }).eq('id', entry.id)
    load()
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this entry? This only removes this single date, not the whole series.')) return
    await supabase.from('cashflow_entries').delete().eq('id', id)
    load()
  }

  function goToPrevMonth() {
    const d = new Date(year, monthIndex - 1, 1)
    setYear(d.getFullYear())
    setMonthIndex(d.getMonth())
  }
  function goToNextMonth() {
    const d = new Date(year, monthIndex + 1, 1)
    setYear(d.getFullYear())
    setMonthIndex(d.getMonth())
  }
  function goToToday() {
    setYear(today.getFullYear())
    setMonthIndex(today.getMonth())
  }

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })

  // Summary for entries actually within this calendar month (not the padding weeks)
  const inMonthEntries = entries.filter((e) => new Date(e.due_date).getMonth() === monthIndex)
  const expectedIncome = inMonthEntries
    .filter((e) => e.type === 'income' && e.status !== 'cancelled')
    .reduce((s, e) => s + Number(e.amount), 0)
  const expectedExpense = inMonthEntries
    .filter((e) => e.type === 'expense' && e.status !== 'cancelled')
    .reduce((s, e) => s + Number(e.amount), 0)
  const overdueCount = entries.filter(isOverdueEntry).length

  const selectedEntries = selectedDate ? entriesForDay(selectedDate) : []

  return (
    <AppLayout title="Cash Flow" subtitle="Expected income and expenses, laid out by date.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Expected income (this month)" value={formatMoney(expectedIncome)} icon={Wallet} tone="brand" />
        <StatCard label="Expected expenses (this month)" value={formatMoney(expectedExpense)} icon={Wallet} tone="rose" />
        <StatCard
          label="Net (this month)"
          value={formatMoney(expectedIncome - expectedExpense)}
          hint={overdueCount > 0 ? `${overdueCount} overdue entr${overdueCount === 1 ? 'y' : 'ies'}` : undefined}
          icon={AlertTriangle}
          tone={overdueCount > 0 ? 'amber' : 'brand'}
        />
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="btn-secondary px-2.5">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-semibold font-display w-44 text-center">{monthLabel}</h2>
          <button onClick={goToNextMonth} className="btn-secondary px-2.5">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Expense
            </span>
          </div>
          <button onClick={goToToday} className="btn-secondary text-sm">
            Today
          </button>
          <button onClick={() => setFormEntry({})} className="btn-primary text-sm">
            <Plus size={15} /> New entry
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-sand-100 text-ink-500 text-xs font-medium">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-3 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="divide-y divide-sand-100">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-sand-100">
              {week.map((date) => {
                const inMonth = date.getMonth() === monthIndex
                const isToday = toISODate(date) === toISODate(today)
                const dayEntries = entriesForDay(date)
                const isSelected = selectedDate && toISODate(selectedDate) === toISODate(date)
                const visible = dayEntries.slice(0, 3)
                const overflow = dayEntries.length - visible.length

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={`min-h-[92px] p-2 text-left align-top flex flex-col gap-1 transition-colors ${
                      inMonth ? 'bg-white' : 'bg-sand-50'
                    } ${isSelected ? 'ring-2 ring-inset ring-brand-500' : 'hover:bg-sand-50'}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white'
                          : inMonth
                          ? 'text-ink-700'
                          : 'text-ink-500/50'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <div className="space-y-1">
                      {visible.map((e) => (
                        <div
                          key={e.id}
                          className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            e.type === 'income' ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-600'
                          } ${isOverdueEntry(e) ? 'ring-1 ring-amber-400' : ''}`}
                          title={e.description}
                        >
                          {e.type === 'income' ? '+' : '-'}
                          {formatMoney(e.amount)}
                        </div>
                      ))}
                      {overflow > 0 && <p className="text-[11px] text-ink-500">+{overflow} more</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3">
          {selectedDate
            ? selectedDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })
            : 'Select a day to see details'}
        </h3>

        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : !selectedDate ? (
          <p className="text-sm text-ink-500">Click any date above to see entries for that day.</p>
        ) : selectedEntries.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing due this day" description="No income or expense entries for this date." />
        ) : (
          <div className="card divide-y divide-sand-100">
            {selectedEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{e.description}</p>
                  <p className="text-xs text-ink-500">
                    {e.category || (e.type === 'income' ? 'Income' : 'Expense')}
                    {e.recurrence_group_id && ' · Recurring'}
                    {isOverdueEntry(e) && <span className="text-amber-600 font-medium"> · Overdue</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-medium ${e.type === 'income' ? 'text-brand-700' : 'text-rose-600'}`}>
                    {e.type === 'income' ? '+' : '-'}
                    {formatMoney(e.amount)}
                  </span>
                  {e.status === 'expected' ? (
                    <button
                      onClick={() => markStatus(e, 'completed')}
                      className="btn-secondary text-xs"
                      title={e.type === 'income' ? 'Mark received' : 'Mark paid'}
                    >
                      <Check size={13} /> {e.type === 'income' ? 'Received' : 'Paid'}
                    </button>
                  ) : e.status === 'completed' ? (
                    <span className="badge-approved text-xs">{e.type === 'income' ? 'Received' : 'Paid'}</span>
                  ) : (
                    <span className="badge-cancelled text-xs">Cancelled</span>
                  )}
                  <button onClick={() => setFormEntry(e)} className="text-ink-500 hover:text-ink-900">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteEntry(e.id)} className="text-rose-500 hover:text-rose-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formEntry !== null && (
        <EntryFormModal
          entry={formEntry}
          orgId={profile.org_id}
          createdBy={profile.id}
          defaultDate={selectedDate ? toISODate(selectedDate) : toISODate(today)}
          onClose={() => setFormEntry(null)}
          onSaved={() => {
            setFormEntry(null)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}

function EntryFormModal({ entry, orgId, createdBy, defaultDate, onClose, onSaved }) {
  const isEdit = Boolean(entry?.id)
  const [type, setType] = useState(entry?.type || 'income')
  const [description, setDescription] = useState(entry?.description || '')
  const [category, setCategory] = useState(entry?.category || '')
  const [amount, setAmount] = useState(entry?.amount || '')
  const [dueDate, setDueDate] = useState(entry?.due_date || defaultDate)
  const [recurrence, setRecurrence] = useState('')
  const [occurrences, setOccurrences] = useState(12)
  const [notes, setNotes] = useState(entry?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!description.trim() || !amount || Number(amount) <= 0 || !dueDate) {
      setError('Fill in description, a positive amount, and a due date.')
      return
    }
    setSaving(true)

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('cashflow_entries')
        .update({
          type,
          description: description.trim(),
          category: category || null,
          amount: Number(amount),
          due_date: dueDate,
          notes: notes || null,
        })
        .eq('id', entry.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      onSaved()
      return
    }

    const baseRow = {
      org_id: orgId,
      type,
      description: description.trim(),
      category: category || null,
      amount: Number(amount),
      status: 'expected',
      notes: notes || null,
      created_by: createdBy,
    }

    let rows = [{ ...baseRow, due_date: dueDate, recurrence_interval_months: recurrence ? Number(recurrence) : null }]

    if (recurrence) {
      const groupId = crypto.randomUUID()
      const interval = Number(recurrence)
      const count = Math.min(Math.max(Number(occurrences) || 1, 1), 60)
      rows = Array.from({ length: count }, (_, i) => {
        const d = new Date(dueDate)
        d.setMonth(d.getMonth() + interval * i)
        return {
          ...baseRow,
          due_date: toISODate(d),
          recurrence_interval_months: interval,
          recurrence_group_id: groupId,
        }
      })
    }

    const { error: insertError } = await supabase.from('cashflow_entries').insert(rows)
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">{isEdit ? 'Edit entry' : 'New cash flow entry'}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('income')}
              className={type === 'income' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={type === 'expense' ? 'btn-danger flex-1' : 'btn-secondary flex-1'}
            >
              Expense
            </button>
          </div>

          <div>
            <label className="field-label">Description</label>
            <input
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'income' ? 'e.g. March tuition fees' : 'e.g. Office rent'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Category (optional)</label>
              <input
                className="field-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={type === 'income' ? 'Tuition' : 'Rent'}
              />
            </div>
            <div>
              <label className="field-label">Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">{isEdit ? 'Due date' : 'First due date'}</label>
            <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="field-label">Repeat</label>
                <select className="field-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {recurrence && (
                <div>
                  <label className="field-label">Number of occurrences to create</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="field-input w-32"
                    value={occurrences}
                    onChange={(e) => setOccurrences(e.target.value)}
                  />
                  <p className="text-xs text-ink-500 mt-1">
                    Creates {occurrences || 0} separate dated entries, each markable on its own.
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <label className="field-label">Notes (optional)</label>
            <textarea className="field-input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create entry'}
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
