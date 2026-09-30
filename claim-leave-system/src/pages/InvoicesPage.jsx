import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil, ArrowLeft, ChevronDown, ChevronUp, MoreVertical, Download, Eye } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { formatDate, RECURRENCE_OPTIONS } from '../lib/helpers'
import { generateReceiptPdf } from '../lib/receiptPdf'
import { generateInvoicePdf } from '../lib/invoicePdf'

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

// Month-picker helpers: "YYYY-MM" <-> "Month YYYY" label, used to let admins
// pick the billing period from a real calendar control instead of typing.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function dateToMonthInput(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : ''
}

function monthInputToLabel(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

function addMonthsToMonthInput(monthStr, months) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function periodLabelFromRange(fromMonth, toMonth) {
  if (!fromMonth) return ''
  if (!toMonth || toMonth === fromMonth) return monthInputToLabel(fromMonth)
  return `${monthInputToLabel(fromMonth)} - ${monthInputToLabel(toMonth)}`
}

// Parses a previously-saved label like "October 2026" or
// "October 2026 - April 2027" back into month-picker values, so editing an
// existing invoice starts from what was actually saved, not a guess.
function parsePeriodLabel(label) {
  if (!label) return null
  const parseOne = (s) => {
    const m = s.trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
    if (!m) return null
    const idx = MONTH_NAMES.findIndex((name) => name.toLowerCase() === m[1].toLowerCase())
    if (idx === -1) return null
    return `${m[2]}-${String(idx + 1).padStart(2, '0')}`
  }
  const parts = label.split(' - ')
  const from = parseOne(parts[0])
  if (!from) return null
  const to = parts[1] ? parseOne(parts[1]) : from
  return { from, to: to || from }
}

function SortHeader({ label, field, sortField, sortDir, onSort, widthClass = '' }) {
  const active = sortField === field
  return (
    <th className={`px-2 py-2 font-medium ${widthClass}`}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-ink-900">
        {label}
        {active ? sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} /> : null}
      </button>
    </th>
  )
}

function statusLabel(inv) {
  if (inv.status === 'cancelled') return { text: 'Cancelled', cls: 'badge-cancelled' }
  if (inv.status === 'paid') return { text: 'Paid', cls: 'badge-approved' }
  if (inv.status === 'partial') return { text: 'Partial', cls: 'badge-pending' }
  return { text: 'Unpaid', cls: 'badge-pending' }
}

function itemsDescription(inv) {
  const descs = (inv.items || []).map((it) => it.description).filter(Boolean)
  if (descs.length === 0) return inv.description || '—'
  const first = inv.invoice_month ? `${descs[0]} : ${inv.invoice_month}` : descs[0]
  return [first, ...descs.slice(1)].join(', ')
}

function RowMenu({ onEdit, onPay, onDownload, onDelete }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = 170
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
            <div className="fixed z-50 w-40 card py-1 shadow-lg bg-white" style={{ top: pos.top, left: pos.left }}>
              <button
                onClick={() => {
                  setOpen(false)
                  onEdit()
                }}
                className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-sand-50"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onPay()
                }}
                className="w-full text-left px-3 py-2 text-xs text-brand-700 hover:bg-sand-50"
              >
                Pay
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onDownload()
                }}
                className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-sand-50"
              >
                Download Invoice
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
  invoiceNo: '',
  studentName: '',
  description: '',
  status: '',
  paymentMethod: '',
  className: '',
  issuedFrom: '',
  issuedTo: '',
}

export default function InvoicesPage() {
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [students, setStudents] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [sortField, setSortField] = useState('issue_date')
  const [sortDir, setSortDir] = useState('desc')
  const [view, setView] = useState('list') // 'list' | 'create' | 'edit'
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkEditingMonth, setBulkEditingMonth] = useState(false)
  const [payingInvoice, setPayingInvoice] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: invoiceData }, { data: studentData }, { data: methodData }] = await Promise.all([
      supabase.from('student_invoices').select('*, students(full_name)').eq('org_id', profile.org_id),
      supabase.from('students').select('*').eq('org_id', profile.org_id).order('full_name'),
      supabase.from('invoice_payment_methods').select('*').eq('org_id', profile.org_id).order('name'),
    ])
    setInvoices(invoiceData || [])
    setStudents(studentData || [])
    setPaymentMethods(methodData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  function onSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  async function deleteInvoice(id) {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('student_invoices').delete().eq('id', id)
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    load()
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} invoice(s)?`)) return
    await supabase.from('student_invoices').delete().in('id', [...selected])
    setSelected(new Set())
    load()
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
    else setSelected(new Set(visible.map((i) => i.id)))
  }

  function applyFilters() {
    setAppliedFilters(filters)
  }
  function resetFilters() {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
  }

  async function handleDownloadInvoice(inv) {
    const { data: org } = await supabase.from('organizations').select('*').eq('id', inv.org_id).single()
    const student = students.find((s) => s.id === inv.student_id)
    await generateInvoicePdf(inv, org, student)
  }

  let visible = invoices.filter((inv) => {
    const f = appliedFilters
    if (f.invoiceNo && !String(inv.invoice_no).includes(f.invoiceNo.trim())) return false
    if (f.studentName && !inv.students?.full_name?.toLowerCase().includes(f.studentName.toLowerCase())) return false
    if (f.description && !itemsDescription(inv).toLowerCase().includes(f.description.toLowerCase())) return false
    if (f.status && inv.status !== f.status) return false
    if (f.paymentMethod && inv.payment_method !== f.paymentMethod) return false
    if (f.className && !(inv.class_name || '').toLowerCase().includes(f.className.toLowerCase())) return false
    if (f.issuedFrom && inv.issue_date < f.issuedFrom) return false
    if (f.issuedTo && inv.issue_date > f.issuedTo) return false
    return true
  })

  visible = [...visible].sort((a, b) => {
    let av, bv
    if (sortField === 'student_name') {
      av = a.students?.full_name || ''
      bv = b.students?.full_name || ''
    } else {
      av = a[sortField]
      bv = b[sortField]
      if (av == null) av = sortField === 'invoice_no' ? 0 : ''
      if (bv == null) bv = sortField === 'invoice_no' ? 0 : ''
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  if (view === 'create') {
    return (
      <CreateInvoicesPage
        orgId={profile.org_id}
        createdBy={profile.id}
        students={students}
        onBack={() => setView('list')}
        onSaved={async () => {
          await load()
          setView('list')
        }}
      />
    )
  }

  if (view === 'edit') {
    return (
      <EditInvoicePage
        invoice={activeInvoice}
        students={students}
        onBack={() => setView('list')}
        onSaved={async () => {
          await load()
          setView('list')
        }}
      />
    )
  }

  return (
    <AppLayout title="Invoices" subtitle="Create, edit, and track every invoice.">
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
                placeholder="Invoice Number"
                value={filters.invoiceNo}
                onChange={(e) => setFilters({ ...filters, invoiceNo: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Description"
                value={filters.description}
                onChange={(e) => setFilters({ ...filters, description: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Student Name"
                value={filters.studentName}
                onChange={(e) => setFilters({ ...filters, studentName: e.target.value })}
              />
              <select className="field-input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">All Status</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Issue Date (from)</label>
                <input
                  type="date"
                  className="field-input"
                  value={filters.issuedFrom}
                  onChange={(e) => setFilters({ ...filters, issuedFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Issue Date (to)</label>
                <input
                  type="date"
                  className="field-input"
                  value={filters.issuedTo}
                  onChange={(e) => setFilters({ ...filters, issuedTo: e.target.value })}
                />
              </div>
              <select
                className="field-input"
                value={filters.paymentMethod}
                onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              >
                <option value="">Payment Method</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                className="field-input"
                placeholder="Class Name"
                value={filters.className}
                onChange={(e) => setFilters({ ...filters, className: e.target.value })}
              />
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
          <button onClick={() => setBulkEditingMonth(true)} className="btn-secondary text-sm">
            Bulk Edit Invoice Month
          </button>
          <button
            onClick={bulkDelete}
            className="text-rose-600 border border-rose-200 hover:bg-rose-50 text-sm rounded-md px-3 py-1.5 font-medium"
          >
            Delete Selected Invoice(s)
          </button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => setView('create')} className="btn-primary text-sm" disabled={students.length === 0}>
          <Plus size={15} /> Create invoices
        </button>
      </div>
      {students.length === 0 && <Alert tone="amber">Add students on the Students page first.</Alert>}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={Pencil} title="No invoices found" description="Try clearing filters, or create your first batch above." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-xs table-fixed">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-2 py-2 w-[4%]">
                  <input type="checkbox" checked={selected.size === visible.length} onChange={toggleSelectAll} />
                </th>
                <SortHeader label="No." field="invoice_no" sortField={sortField} sortDir={sortDir} onSort={onSort} widthClass="w-[8%]" />
                <th className="px-2 py-2 font-medium w-[13%]">
                  <button onClick={() => onSort('student_name')} className="inline-flex items-center gap-1 hover:text-ink-900">
                    Student
                    {sortField === 'student_name' ? sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} /> : null}
                  </button>
                </th>
                <th className="px-2 py-2 font-medium w-[30%]">Description</th>
                <th className="px-2 py-2 font-medium w-[13%]">Amount</th>
                <SortHeader label="Issued" field="issue_date" sortField={sortField} sortDir={sortDir} onSort={onSort} widthClass="w-[9%]" />
                <th className="px-2 py-2 font-medium w-[17%]">Payment</th>
                <th className="px-2 py-2 font-medium w-[6%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {visible.map((inv) => {
                const payable = Math.max(Number(inv.amount) - Number(inv.payment_amount || 0), 0)
                const st = statusLabel(inv)
                return (
                  <tr key={inv.id}>
                    <td className="px-2 py-2 align-top">
                      <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                    </td>
                    <td className="px-2 py-2 align-top whitespace-normal break-words">
                      <button
                        onClick={() => {
                          setActiveInvoice(inv)
                          setView('edit')
                        }}
                        className="font-semibold text-brand-600 hover:underline"
                      >
                        INV-{String(inv.invoice_no).padStart(5, '0')}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top text-ink-900 whitespace-normal break-words">{inv.students?.full_name}</td>
                    <td className="px-2 py-2 align-top text-ink-700 whitespace-normal break-words">{itemsDescription(inv)}</td>
                    <td className="px-2 py-2 align-top text-ink-700 whitespace-normal">
                      <div>RM {Number(inv.amount).toFixed(2)}</div>
                      <div className="text-ink-500">
                        RM {payable.toFixed(2)} <span className={`${st.cls} text-[10px]`}>{st.text}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top text-ink-700 whitespace-normal">{formatDate(inv.issue_date)}</td>
                    <td className="px-2 py-2 align-top text-ink-700 whitespace-normal">
                      <div>{inv.payment_method || '—'}: RM {Number(inv.payment_amount || 0).toFixed(2)}</div>
                      {inv.payment_date && <div className="text-ink-500">{formatDate(inv.payment_date)}</div>}
                    </td>
                    <td className="px-2 py-2 align-top text-right">
                      <RowMenu
                        onEdit={() => {
                          setActiveInvoice(inv)
                          setView('edit')
                        }}
                        onPay={() => setPayingInvoice(inv)}
                        onDownload={() => handleDownloadInvoice(inv)}
                        onDelete={() => deleteInvoice(inv.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}

      {bulkEditingMonth && (
        <BulkEditMonthModal
          count={selected.size}
          onClose={() => setBulkEditingMonth(false)}
          onSaved={async (month) => {
            await supabase.from('student_invoices').update({ invoice_month: month }).in('id', [...selected])
            setBulkEditingMonth(false)
            setSelected(new Set())
            load()
          }}
        />
      )}

      {payingInvoice && (
        <QuickPayModal
          invoice={payingInvoice}
          students={students}
          paymentMethods={paymentMethods}
          onClose={() => setPayingInvoice(null)}
          onSaved={async () => {
            setPayingInvoice(null)
            await load()
          }}
        />
      )}
    </AppLayout>
  )
}

function BulkEditMonthModal({ count, onClose, onSaved }) {
  const [month, setMonth] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!month.trim()) return
    setSaving(true)
    await onSaved(month.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Edit invoice month for {count} invoice(s)</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            ✕
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="field-label">Invoice month</label>
            <input
              className="field-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="e.g. March 2026"
            />
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

function QuickPayModal({ invoice, students, paymentMethods, onClose, onSaved }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [payType, setPayType] = useState('full') // 'full' | 'partial'
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadPayments() {
    setLoading(true)
    const { data } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('receipt_no', { ascending: false })
    setPayments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadPayments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id])

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Math.max(Number(invoice.amount) - totalPaid, 0)

  async function handleDeletePayment(id) {
    if (!confirm('Remove this payment record? This cannot be undone.')) return
    await supabase.from('invoice_payments').delete().eq('id', id)
    const { data } = await supabase
      .from('invoice_payments')
      .select('amount, payment_method, payment_date')
      .eq('invoice_id', invoice.id)
      .order('payment_date', { ascending: false })
    const newTotal = (data || []).reduce((s, p) => s + Number(p.amount), 0)
    const latest = (data || [])[0]
    await updateInvoiceAggregate(newTotal, latest?.payment_method ?? null, latest?.payment_date ?? null)
    loadPayments()
    onSaved()
  }

  async function updateInvoiceAggregate(newTotal, latestMethod, latestDate) {
    const status = newTotal >= Number(invoice.amount) && newTotal > 0 ? 'paid' : newTotal > 0 ? 'partial' : 'unpaid'
    const patch = { payment_amount: newTotal, status }
    if (latestMethod !== undefined) patch.payment_method = latestMethod
    if (latestDate !== undefined) patch.payment_date = latestDate
    await supabase.from('student_invoices').update(patch).eq('id', invoice.id)
  }

  async function handleAddPayment(e) {
    e.preventDefault()
    setError('')
    const amt = payType === 'full' ? remaining : Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    if (payType === 'partial' && amt > remaining) {
      setError(`Amount can't exceed the remaining RM ${remaining.toFixed(2)}.`)
      return
    }
    setSaving(true)

    const { data: inserted, error: insertError } = await supabase
      .from('invoice_payments')
      .insert({
        org_id: invoice.org_id,
        invoice_id: invoice.id,
        amount: amt,
        payment_method: paymentMethod || null,
        payment_date: paymentDate,
      })
      .select()
      .single()
    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    await updateInvoiceAggregate(totalPaid + amt, paymentMethod || null, paymentDate)
    setSaving(false)
    setAmount('')
    loadPayments()
    onSaved()
  }

  function handleViewReceipt(payment) {
    const student = students.find((s) => s.id === invoice.student_id)
    generateReceiptPdf(payment, invoice, student?.full_name)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Pay · INV-{String(invoice.invoice_no).padStart(5, '0')}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            ✕
          </button>
        </div>

        <div className="flex justify-between text-sm mb-4">
          <span className="text-ink-500">Total: RM {Number(invoice.amount).toFixed(2)}</span>
          <span className={remaining === 0 ? 'text-brand-700 font-medium' : 'text-rose-600 font-medium'}>
            {remaining === 0 ? 'Fully paid' : `RM ${remaining.toFixed(2)} remaining`}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-ink-500 mb-4">Loading history…</p>
        ) : payments.length > 0 ? (
          <div className="mb-5">
            <p className="text-xs font-semibold text-ink-500 uppercase mb-2">Payment history</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-sand-50">
                  <div>
                    <span className="font-medium text-ink-900">R-{String(p.receipt_no).padStart(5, '0')}</span>
                    <span className="text-ink-500">
                      {' '}
                      · {p.payment_method || 'unspecified'} · {formatDate(p.payment_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ink-900 font-medium">RM {Number(p.amount).toFixed(2)}</span>
                    <button onClick={() => handleViewReceipt(p)} className="text-brand-600 hover:text-brand-700" title="View/download receipt">
                      <Download size={12} />
                    </button>
                    <button onClick={() => handleDeletePayment(p.id)} className="text-rose-500 hover:text-rose-600" title="Delete receipt">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500 mb-5">No payments recorded yet.</p>
        )}

        {remaining > 0 && (
          <form onSubmit={handleAddPayment} className="space-y-4 pt-4 border-t border-sand-200">
            <p className="text-xs font-semibold text-ink-500 uppercase">Add payment</p>
            {error && <Alert tone="rose">{error}</Alert>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPayType('full')}
                className={payType === 'full' ? 'btn-primary flex-1 text-sm' : 'btn-secondary flex-1 text-sm'}
              >
                Full Payment
              </button>
              <button
                type="button"
                onClick={() => setPayType('partial')}
                className={payType === 'partial' ? 'btn-primary flex-1 text-sm' : 'btn-secondary flex-1 text-sm'}
              >
                Partial Payment
              </button>
            </div>

            {payType === 'full' ? (
              <p className="text-sm text-ink-700">Amount: RM {remaining.toFixed(2)}</p>
            ) : (
              <div>
                <label className="field-label">Amount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  className="field-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Up to ${remaining.toFixed(2)}`}
                />
              </div>
            )}

            <div>
              <label className="field-label">Payment method</label>
              <select className="field-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">— Not set —</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Payment date</label>
              <input type="date" className="field-input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Saving…' : 'Record payment'}
            </button>
          </form>
        )}

        <button type="button" onClick={onClose} className="btn-secondary w-full mt-4">
          Close
        </button>
      </div>
    </div>
  )
}


function computeItemTotal(it) {
  const amt = Number(it.amount || 0)
  const taxAmt = (amt * Number(it.tax_percentage || 0)) / 100
  const adjAmt = it.adjustment_enabled ? Number(it.adjustment_amount || 0) : 0
  const adjSigned = it.adjustment_type === 'penalty' ? adjAmt : -adjAmt
  return { taxAmt, adjSigned, total: amt + taxAmt + adjSigned }
}

function InvoiceItemsTable({ items, setItems, taxItems, discountItems }) {
  function addItem() {
    setItems([
      ...items,
      {
        description: '',
        package_name: '',
        amount: '',
        tax_item_id: '',
        tax_percentage: 0,
        adjustment_enabled: false,
        adjustment_type: 'discount',
        adjustment_amount: 0,
      },
    ])
  }
  function updateItem(i, field, value) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)))
  }
  function applyTaxItem(i, taxId) {
    const tax = taxItems.find((t) => t.id === taxId)
    setItems(
      items.map((it, idx) =>
        idx === i
          ? { ...it, tax_item_id: taxId, tax_percentage: tax && tax.type === 'percent' ? tax.value : it.tax_percentage }
          : it
      )
    )
  }
  function applyDiscountItem(i, discId) {
    const disc = discountItems.find((d) => d.id === discId)
    if (!disc) return
    setItems(
      items.map((it, idx) => {
        if (idx !== i) return it
        const amt = disc.type === 'percent' ? (Number(it.amount || 0) * Number(disc.value)) / 100 : Number(disc.value)
        return { ...it, adjustment_label: disc.name, adjustment_amount: amt }
      })
    )
  }
  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div className="space-y-4">
        {items.map((it, i) => {
          const { taxAmt } = computeItemTotal(it)
          return (
            <div key={i} className="border border-sand-200 rounded-lg p-3">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label className="text-xs text-ink-500 mb-1 block">Invoice Item Description</label>
                  <input
                    className="field-input"
                    value={it.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-500 mb-1 block">Package Name (optional)</label>
                  <input
                    className="field-input"
                    value={it.package_name}
                    onChange={(e) => updateItem(i, 'package_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-500 mb-1 block">Amount (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="field-input"
                    value={it.amount}
                    onChange={(e) => updateItem(i, 'amount', e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => updateItem(i, 'adjustment_enabled', !it.adjustment_enabled)}
                    className={it.adjustment_enabled ? 'btn-primary text-xs flex-1' : 'btn-secondary text-xs flex-1'}
                  >
                    + Discount/Penalty
                  </button>
                  <button type="button" onClick={() => removeItem(i)} className="text-rose-500 p-2">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-ink-500 mb-1 block">Tax Item</label>
                  <select className="field-input" value={it.tax_item_id} onChange={(e) => applyTaxItem(i, e.target.value)}>
                    <option value="">Select Tax Item</option>
                    {taxItems.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink-500 mb-1 block">Tax Percentage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="field-input"
                    value={it.tax_percentage}
                    onChange={(e) => updateItem(i, 'tax_percentage', e.target.value)}
                  />
                  {taxAmt > 0 && <p className="text-xs text-ink-500 mt-1">= RM {taxAmt.toFixed(2)} tax</p>}
                </div>
              </div>

              {it.adjustment_enabled && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-sand-100">
                  <div>
                    <label className="text-xs text-ink-500 mb-1 block">Type</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateItem(i, 'adjustment_type', 'discount')}
                        className={it.adjustment_type === 'discount' ? 'btn-primary text-xs flex-1' : 'btn-secondary text-xs flex-1'}
                      >
                        Discount
                      </button>
                      <button
                        type="button"
                        onClick={() => updateItem(i, 'adjustment_type', 'penalty')}
                        className={it.adjustment_type === 'penalty' ? 'btn-primary text-xs flex-1' : 'btn-secondary text-xs flex-1'}
                      >
                        Penalty
                      </button>
                    </div>
                  </div>
                  {it.adjustment_type === 'discount' && discountItems.length > 0 && (
                    <div>
                      <label className="text-xs text-ink-500 mb-1 block">Discount item (optional)</label>
                      <select className="field-input" defaultValue="" onChange={(e) => e.target.value && applyDiscountItem(i, e.target.value)}>
                        <option value="">— Custom —</option>
                        {discountItems.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-ink-500 mb-1 block">Amount (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="field-input"
                      value={it.adjustment_amount}
                      onChange={(e) => updateItem(i, 'adjustment_amount', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={addItem} className="btn-primary text-sm mt-4">
        <Plus size={14} /> Add Invoice Item
      </button>
    </div>
  )
}

const readOnlyField = 'field-input bg-sand-100 text-ink-500 cursor-not-allowed'

function EditInvoicePage({ invoice, students, onBack, onSaved }) {
  const { profile } = useAuth()
  const student = students.find((s) => s.id === invoice.student_id)

  const [invoiceStatus, setInvoiceStatus] = useState(invoice.status || 'unpaid')
  const [issueDate, setIssueDate] = useState(invoice.issue_date || invoice.due_date)
  const [dueDate, setDueDate] = useState(invoice.due_date)
  const [paymentAmount, setPaymentAmount] = useState(invoice.payment_amount || 0)
  const [showPayModal, setShowPayModal] = useState(false)
  const [className, setClassName] = useState(invoice.class_name || '')
  const [studentClasses, setStudentClasses] = useState([])
  const [createdByName, setCreatedByName] = useState('')
  const [org, setOrg] = useState(null)

  const [items, setItems] = useState(
    invoice.items?.length
      ? invoice.items.map((it) => ({
          description: it.description || '',
          package_name: it.package_name || '',
          amount: it.amount ?? 0,
          tax_item_id: it.tax_item_id || '',
          tax_percentage: it.tax_percentage || 0,
          adjustment_enabled: Boolean(it.adjustment_enabled),
          adjustment_type: it.adjustment_type || 'discount',
          adjustment_label: it.adjustment_label || '',
          adjustment_amount: it.adjustment_amount || 0,
        }))
      : [
          {
            description: invoice.description || '',
            package_name: '',
            amount: invoice.subtotal ?? invoice.amount ?? 0,
            tax_item_id: '',
            tax_percentage: 0,
            adjustment_enabled: false,
            adjustment_type: 'discount',
            adjustment_label: '',
            adjustment_amount: 0,
          },
        ]
  )

  const [taxItems, setTaxItems] = useState([])
  const [discountItems, setDiscountItems] = useState([])
  const [remarkTemplates, setRemarkTemplates] = useState([])
  const [remark, setRemark] = useState(invoice.notes || '')
  const [paymentMethods, setPaymentMethods] = useState([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadOptions() {
      const [{ data: enrollments }, { data: taxes }, { data: discounts }, { data: remarks }, { data: methods }, { data: creator }, { data: orgData }] =
        await Promise.all([
          supabase
            .from('class_enrollments')
            .select('classes(name)')
            .eq('org_id', profile.org_id)
            .eq('student_id', invoice.student_id),
          supabase.from('invoice_tax_items').select('*').eq('org_id', profile.org_id).order('name'),
          supabase.from('invoice_discount_items').select('*').eq('org_id', profile.org_id).order('name'),
          supabase.from('invoice_remark_templates').select('*').eq('org_id', profile.org_id).order('created_at'),
          supabase.from('invoice_payment_methods').select('*').eq('org_id', profile.org_id).order('name'),
          invoice.created_by
            ? supabase.from('profiles').select('full_name').eq('id', invoice.created_by).single()
            : Promise.resolve({ data: null }),
          supabase.from('organizations').select('*').eq('id', invoice.org_id).single(),
        ])
      setStudentClasses((enrollments || []).map((e) => e.classes?.name).filter(Boolean))
      setTaxItems(taxes || [])
      setDiscountItems(discounts || [])
      setRemarkTemplates(remarks || [])
      setPaymentMethods(methods || [])
      setCreatedByName(creator?.full_name || '—')
      setOrg(orgData || null)
    }
    loadOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.student_id])

  const subTotal = items.reduce((s, it) => s + Number(it.amount || 0), 0)
  const taxableAmount = items.reduce((s, it) => s + computeItemTotal(it).taxAmt, 0)
  const adjustmentTotal = items.reduce((s, it) => s + computeItemTotal(it).adjSigned, 0)
  const grandTotal = Math.max(subTotal + taxableAmount + adjustmentTotal, 0)

  // Invoice month/period — editable via month pickers, but initialized from
  // whatever was actually saved (parsed back), not silently recomputed.
  const parsedInvoicePeriod = parsePeriodLabel(invoice.invoice_month)
  const defaultFrom = parsedInvoicePeriod?.from || dateToMonthInput(issueDate)
  const defaultTo =
    parsedInvoicePeriod?.to || addMonthsToMonthInput(defaultFrom, Number(invoice.recurrence_interval_months || 1) - 1)
  const [periodFrom, setPeriodFrom] = useState(defaultFrom)
  const [periodTo, setPeriodTo] = useState(defaultTo)
  const invoiceMonth = periodLabelFromRange(periodFrom, periodTo)

  async function toggleCancelled() {
    const newStatus = invoiceStatus === 'cancelled' ? (paymentAmount > 0 ? 'partial' : 'unpaid') : 'cancelled'
    const { error: updateError } = await supabase.from('student_invoices').update({ status: newStatus }).eq('id', invoice.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setInvoiceStatus(newStatus)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const cleanItems = items.filter((it) => it.description.trim() || Number(it.amount) > 0)
    if (!issueDate || cleanItems.length === 0) {
      setError('Enter a valid issue date and at least one invoice item.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase
      .from('student_invoices')
      .update({
        description: cleanItems[0]?.description || null,
        invoice_month: invoiceMonth || null,
        issue_date: issueDate,
        due_date: dueDate || issueDate,
        class_name: className || null,
        items: cleanItems,
        subtotal: subTotal,
        tax_amount: taxableAmount,
        discount_amount: adjustmentTotal < 0 ? -adjustmentTotal : 0,
        amount: grandTotal,
        notes: remark || null,
      })
      .eq('id', invoice.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onSaved()
  }

  async function handleDownload() {
    await generateInvoicePdf(
      { ...invoice, items, subtotal: subTotal, tax_amount: taxableAmount, amount: grandTotal, notes: remark, invoice_month: invoiceMonth, issue_date: issueDate, due_date: dueDate },
      org,
      student
    )
  }

  return (
    <AppLayout title="" subtitle="">
      <nav className="text-sm mb-2">
        <button onClick={onBack} className="text-brand-600 hover:underline">
          Invoices
        </button>
        <span className="text-ink-400"> / View and Edit Invoice</span>
      </nav>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-ink-900 uppercase tracking-wide">
          View and Edit Invoice - INV-{String(invoice.invoice_no).padStart(5, '0')}
        </h1>
        <button type="button" onClick={handleDownload} className="btn-secondary text-sm">
          <Download size={14} /> Download Invoice
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && <Alert tone="rose">{error}</Alert>}

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-4">Invoice Details:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Invoice Number</label>
              <input className={readOnlyField} value={`INV-${String(invoice.invoice_no).padStart(5, '0')}`} disabled />
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Invoice Status</label>
              <div className="flex items-center gap-2 h-[42px]">
                {invoiceStatus === 'paid' && <span className="badge-approved">Fully Paid</span>}
                {invoiceStatus === 'partial' && <span className="badge-pending">Partially Paid</span>}
                {invoiceStatus === 'unpaid' && <span className="badge-pending">Unpaid</span>}
                {invoiceStatus === 'cancelled' && <span className="badge-cancelled">Cancelled</span>}
                <button
                  type="button"
                  onClick={toggleCancelled}
                  className="text-xs text-ink-500 hover:text-ink-900 underline"
                >
                  {invoiceStatus === 'cancelled' ? 'Reactivate' : 'Cancel invoice'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-ink-500 mb-1 block">Student Name</label>
              <input className={readOnlyField} value={student?.full_name || ''} disabled />
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Generated Date</label>
              <input className={readOnlyField} value={formatDate(invoice.created_at?.slice(0, 10))} disabled />
            </div>

            <div>
              <label className="text-xs text-ink-500 mb-1 block">Issue Date</label>
              <input type="date" className="field-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Due Date</label>
              <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-ink-500 mb-1 block">Payments</label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-700">RM {Number(paymentAmount).toFixed(2)} paid so far</span>
                <button type="button" onClick={() => setShowPayModal(true)} className="btn-secondary text-xs">
                  Manage payments
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-ink-500 mb-1 block">Invoice Created By</label>
              <input className={readOnlyField} value={createdByName} disabled />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-ink-500 mb-1 block">Invoice Month</label>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="month"
                  className="field-input"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
                <input
                  type="month"
                  className="field-input"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-ink-500 mt-1">
                Will show as "<span className="font-medium">{invoiceMonth}</span>"
              </p>
            </div>
            <div>
              <label className="text-xs text-ink-500 mb-1 block">Class (optional)</label>
              <select className="field-input" value={className} onChange={(e) => setClassName(e.target.value)}>
                <option value="">— None —</option>
                {studentClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-4">Invoice Items</h3>
          <InvoiceItemsTable items={items} setItems={setItems} taxItems={taxItems} discountItems={discountItems} />
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-3">Remark</h3>
          {remarkTemplates.length > 0 && (
            <select className="field-input mb-3" defaultValue="" onChange={(e) => {
              const t = remarkTemplates.find((r) => r.id === e.target.value)
              if (t) setRemark((prev) => (prev ? `${prev}\n${t.text}` : t.text))
            }}>
              <option value="">Insert a saved remark…</option>
              {remarkTemplates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.text.slice(0, 60)}
                </option>
              ))}
            </select>
          )}
          <textarea className="field-input min-h-[70px]" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Sub Total:</span>
              <span className="text-ink-900">MYR {subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Taxable Amount:</span>
              <span className="text-ink-900">MYR {taxableAmount.toFixed(2)}</span>
            </div>
            {adjustmentTotal !== 0 && (
              <div className="flex justify-between">
                <span className="text-ink-500">Discount/Penalty:</span>
                <span className="text-ink-900">MYR {adjustmentTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-sand-200 font-semibold">
              <span className="text-ink-900">Grand Total:</span>
              <span className="text-ink-900">MYR {grandTotal.toFixed(2)}</span>
            </div>
            {invoiceStatus !== 'unpaid' && Number(paymentAmount) > 0 && (
              <p className="text-xs text-ink-500 pt-2 text-right">
                {invoiceStatus === 'paid' ? 'Fully' : 'Partially'} settled — RM {Number(paymentAmount).toFixed(2)} paid.{' '}
                <button type="button" onClick={() => setShowPayModal(true)} className="underline">
                  View payment history
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save invoice'}
          </button>
          <button type="button" onClick={onBack} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>

      {showPayModal && (
        <QuickPayModal
          invoice={invoice}
          students={students}
          paymentMethods={paymentMethods}
          onClose={() => setShowPayModal(false)}
          onSaved={async () => {
            const { data } = await supabase
              .from('student_invoices')
              .select('status, payment_amount')
              .eq('id', invoice.id)
              .single()
            if (data) {
              setInvoiceStatus(data.status)
              setPaymentAmount(data.payment_amount)
            }
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

function CreateInvoicesPage({ orgId, createdBy, students, onBack, onSaved }) {
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([{ description: '', amount: '' }])
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [billingFrequency, setBillingFrequency] = useState('') // '' = one-time
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0)
  const previewMonth = computePeriodLabel(dueDate, billingFrequency || 1)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    const cleanItems = items.filter((it) => it.description.trim() || Number(it.amount) > 0)
    if (selected.size === 0 || cleanItems.length === 0) {
      setError('Select at least one student and add at least one billing line.')
      return
    }
    setSaving(true)

    if (!billingFrequency) {
      // One-time — create the invoice(s) right now.
      const rows = [...selected].map((studentId) => ({
        org_id: orgId,
        student_id: studentId,
        description: cleanItems[0]?.description || null,
        items: cleanItems,
        amount: total,
        subtotal: total,
        due_date: dueDate,
        issue_date: dueDate,
        invoice_month: computePeriodLabel(dueDate, 1),
        created_by: createdBy,
      }))
      const { error: insertError } = await supabase.from('student_invoices').insert(rows)
      setSaving(false)
      if (insertError) {
        setError(insertError.message)
        return
      }
      onSaved()
      return
    }

    // Recurring — set up a plan per student. The daily automatic job
    // generates the actual invoice once next_generation_date arrives,
    // so nothing is added to the invoice list until it's genuinely due.
    const planRows = [...selected].map((studentId) => ({
      org_id: orgId,
      student_id: studentId,
      items: cleanItems,
      amount: total,
      recurrence_interval_months: Number(billingFrequency),
      next_generation_date: dueDate,
      next_invoice_month: computePeriodLabel(dueDate, billingFrequency),
      created_by: createdBy,
    }))
    const { error: insertError } = await supabase.from('recurring_invoice_plans').insert(planRows)
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onSaved()
  }

  const filteredStudents = students.filter((s) => s.full_name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <AppLayout title="" subtitle="">
      <nav className="text-sm mb-2">
        <button onClick={onBack} className="text-brand-600 hover:underline">
          Invoices
        </button>
        <span className="text-ink-400"> / Create Invoices</span>
      </nav>
      <h1 className="text-lg font-semibold text-ink-900 uppercase tracking-wide mb-6">Create Invoices</h1>

      <form onSubmit={handleCreate} className="max-w-3xl space-y-6">
        {error && <Alert tone="rose">{error}</Alert>}

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-4">Students ({selected.size} selected)</h3>
          <input
            type="text"
            className="field-input mb-2"
            placeholder="Search students…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-1 max-h-56 overflow-y-auto border border-sand-200 rounded-md p-2">
            {filteredStudents.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-sand-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.full_name}
              </label>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 text-sm mb-4">Billing (applied to every selected student)</h3>
          <ItemsEditor items={items} setItems={setItems} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-ink-900 text-sm">Schedule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Due date</label>
              <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Invoice month</label>
              <input className={readOnlyField} value={previewMonth} disabled />
            </div>
          </div>

          <div>
            <label className="field-label">Billing frequency</label>
            <select className="field-input" value={billingFrequency} onChange={(e) => setBillingFrequency(e.target.value)}>
              <option value="">One-time (create this invoice now)</option>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} (recurring)
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-500 mt-1">
              {billingFrequency
                ? "This sets up a recurring plan. The invoice generates automatically on its due date — you won't see it in the invoice list until then."
                : 'Creates the invoice immediately for each selected student.'}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : billingFrequency ? 'Set up recurring billing' : 'Create invoices'}
          </button>
          <button type="button" onClick={onBack} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </AppLayout>
  )
}
