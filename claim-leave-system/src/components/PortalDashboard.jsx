import { Fragment, useEffect, useState } from 'react'
import { Megaphone, ClipboardList, Receipt, CalendarClock, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/helpers'
import { generateInvoicePdf } from '../lib/invoicePdf'
import { generateReceiptPdf } from '../lib/receiptPdf'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatTimeLabel(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Announcement text is rich HTML written by staff but shown to parents, so keep only
// plain formatting tags and drop scripts, event handlers and unsafe links.
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'BR', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4',
  'BLOCKQUOTE', 'SPAN', 'DIV', 'IMG', 'CODE', 'PRE', 'HR',
])
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH'])

function cleanHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) return
      if (child.nodeType !== 1) {
        child.remove()
        return
      }
      if (DROP_TAGS.has(child.tagName)) {
        child.remove()
        return
      }
      if (!ALLOWED_TAGS.has(child.tagName)) {
        walk(child)
        child.replaceWith(...Array.from(child.childNodes))
        return
      }
      Array.from(child.attributes).forEach((attr) => {
        const val = attr.value.trim().toLowerCase()
        const okHref = child.tagName === 'A' && attr.name === 'href' && /^(https?:|mailto:|tel:|\/|#)/.test(val)
        const okSrc = child.tagName === 'IMG' && attr.name === 'src' && /^(https?:|data:image\/)/.test(val)
        const okAlt = child.tagName === 'IMG' && attr.name === 'alt'
        if (!okHref && !okSrc && !okAlt) child.removeAttribute(attr.name)
      })
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank')
        child.setAttribute('rel', 'noreferrer noopener')
      }
      walk(child)
    })
  }
  walk(doc.body)
  return doc.body.innerHTML
}

function statusBadge(status) {
  if (status === 'present') return <span className="badge-approved">Present</span>
  if (status === 'absent') return <span className="badge-cancelled">Absent</span>
  if (status === 'late') return <span className="badge-pending">Late</span>
  return <span className="text-ink-400 text-xs">Unmarked</span>
}

// canDownload: parents can download invoice / receipt PDFs; the student view is read-only.
export default function PortalDashboard({ student, canDownload = false }) {
  const [tab, setTab] = useState('announcements')
  const [announcements, setAnnouncements] = useState([])
  const [attendance, setAttendance] = useState([])
  const [invoices, setInvoices] = useState([])
  const [paymentsByInvoice, setPaymentsByInvoice] = useState({})
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    if (student?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id])

  async function load() {
    setLoading(true)
    const [{ data: ann }, { data: att }, { data: inv }, { data: enroll }] = await Promise.all([
      supabase
        .from('announcements')
        .select('*')
        .contains('target_groups', ['students'])
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('student_attendance')
        .select('*, classes(name)')
        .eq('student_id', student.id)
        .order('attendance_date', { ascending: false })
        .limit(30),
      supabase.from('student_invoices').select('*').eq('student_id', student.id).order('issue_date', { ascending: false }),
      supabase
        .from('class_enrollments')
        .select('classes(id, name, day_of_week, start_time, end_time, room)')
        .eq('student_id', student.id),
    ])

    const invoiceList = inv || []
    const payMap = {}
    if (canDownload && invoiceList.length > 0) {
      const { data: pays } = await supabase
        .from('invoice_payments')
        .select('*')
        .in(
          'invoice_id',
          invoiceList.map((i) => i.id)
        )
        .order('payment_date', { ascending: false })
      ;(pays || []).forEach((p) => {
        if (!payMap[p.invoice_id]) payMap[p.invoice_id] = []
        payMap[p.invoice_id].push(p)
      })
    }

    setAnnouncements(ann || [])
    setAttendance(att || [])
    setInvoices(invoiceList)
    setPaymentsByInvoice(payMap)
    setClasses((enroll || []).map((e) => e.classes).filter(Boolean))
    setLoading(false)
  }

  async function handleDownloadInvoice(inv) {
    setDownloadError('')
    setDownloadingId(`inv-${inv.id}`)
    try {
      const { data: org } = await supabase.from('organizations').select('*').eq('id', inv.org_id).single()
      await generateInvoicePdf(inv, org, student)
    } catch (err) {
      setDownloadError('Could not create the invoice PDF. Please try again.')
    }
    setDownloadingId(null)
  }

  async function handleDownloadReceipt(payment, inv) {
    setDownloadError('')
    setDownloadingId(`rec-${payment.id}`)
    try {
      await generateReceiptPdf(payment, inv, student.full_name)
    } catch (err) {
      setDownloadError('Could not create the receipt PDF. Please try again.')
    }
    setDownloadingId(null)
  }

  const TABS = [
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'attendance', label: 'Attendance', icon: ClipboardList },
    { key: 'invoices', label: 'Invoices', icon: Receipt },
    { key: 'schedule', label: 'Class Schedule', icon: CalendarClock },
  ]

  return (
    <div>
      <div className="flex gap-2 border-b border-sand-200 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <>
          {tab === 'announcements' && (
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-ink-500">No announcements yet.</p>
              ) : (
                announcements.map((a) => (
                  <div key={a.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-medium text-ink-900">{a.title}</h4>
                      {a.pinned && <span className="badge-pending shrink-0">Pinned</span>}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5 mb-3">{formatDate(a.created_at?.slice(0, 10))}</p>
                    {a.body_html && (
                      <div
                        className="max-w-none text-sm text-ink-700 [&_a]:text-brand-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: cleanHtml(a.body_html) }}
                      />
                    )}
                    {Array.isArray(a.media) && a.media.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {a.media.map((m, i) =>
                          m.type === 'video' ? (
                            <video key={i} src={m.url} controls className="rounded-md w-full aspect-video bg-black" />
                          ) : (
                            <a key={i} href={m.url} target="_blank" rel="noreferrer">
                              <img src={m.url} alt={m.name || ''} className="rounded-md w-full aspect-video object-cover" />
                            </a>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'attendance' && (
            <div className="card overflow-hidden">
              {attendance.length === 0 ? (
                <p className="text-sm text-ink-500 p-5">No attendance records yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Class</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {attendance.map((a) => (
                      <tr key={a.id}>
                        <td className="px-5 py-3 text-ink-900">{formatDate(a.attendance_date)}</td>
                        <td className="px-5 py-3 text-ink-700">{a.classes?.name || '—'}</td>
                        <td className="px-5 py-3">{statusBadge(a.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'invoices' && (
            <>
              {downloadError && <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2 mb-3">{downloadError}</p>}
              <div className="card overflow-hidden">
                {invoices.length === 0 ? (
                  <p className="text-sm text-ink-500 p-5">No invoices yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-sand-100 text-ink-500 text-left">
                        <tr>
                          <th className="px-5 py-3 font-medium">Invoice</th>
                          <th className="px-5 py-3 font-medium">Issued</th>
                          <th className="px-5 py-3 font-medium">Total</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                          {canDownload && <th className="px-5 py-3 font-medium">Documents</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-100">
                        {invoices.map((inv) => {
                          const payable = Math.max(Number(inv.amount) - Number(inv.payment_amount || 0), 0)
                          const receipts = paymentsByInvoice[inv.id] || []
                          const expanded = expandedInvoiceId === inv.id
                          return (
                            <Fragment key={inv.id}>
                              <tr>
                                <td className="px-5 py-3 font-medium text-ink-900">INV-{String(inv.invoice_no).padStart(5, '0')}</td>
                                <td className="px-5 py-3 text-ink-700">{formatDate(inv.issue_date)}</td>
                                <td className="px-5 py-3 text-ink-700">RM {Number(inv.amount).toFixed(2)}</td>
                                <td className="px-5 py-3">
                                  {inv.status === 'paid' ? (
                                    <span className="badge-approved">Paid</span>
                                  ) : inv.status === 'partial' ? (
                                    <span className="badge-pending">Partial — RM {payable.toFixed(2)} due</span>
                                  ) : inv.status === 'cancelled' ? (
                                    <span className="badge-cancelled">Cancelled</span>
                                  ) : (
                                    <span className="badge-pending">Unpaid — RM {payable.toFixed(2)} due</span>
                                  )}
                                </td>
                                {canDownload && (
                                  <td className="px-5 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        onClick={() => handleDownloadInvoice(inv)}
                                        disabled={downloadingId === `inv-${inv.id}`}
                                        className="btn-secondary text-xs"
                                      >
                                        <Download size={13} /> {downloadingId === `inv-${inv.id}` ? 'Preparing…' : 'Invoice'}
                                      </button>
                                      {receipts.length > 0 && (
                                        <button
                                          onClick={() => setExpandedInvoiceId(expanded ? null : inv.id)}
                                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                                        >
                                          Receipts ({receipts.length}) {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                              {canDownload && expanded && (
                                <tr className="bg-sand-50">
                                  <td colSpan={5} className="px-5 py-3">
                                    <div className="space-y-2">
                                      {receipts.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between text-xs">
                                          <span className="text-ink-700">
                                            R-{String(p.receipt_no).padStart(5, '0')} · {formatDate(p.payment_date)} · RM{' '}
                                            {Number(p.amount).toFixed(2)}
                                          </span>
                                          <button
                                            onClick={() => handleDownloadReceipt(p, inv)}
                                            disabled={downloadingId === `rec-${p.id}`}
                                            className="btn-secondary text-xs"
                                          >
                                            <Download size={12} /> {downloadingId === `rec-${p.id}` ? 'Preparing…' : 'Receipt'}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'schedule' && (
            <div className="card overflow-hidden">
              {classes.length === 0 ? (
                <p className="text-sm text-ink-500 p-5">Not enrolled in any classes yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-ink-500 text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Class</th>
                      <th className="px-5 py-3 font-medium">Day &amp; time</th>
                      <th className="px-5 py-3 font-medium">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {classes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-3 font-medium text-ink-900">{c.name}</td>
                        <td className="px-5 py-3 text-ink-700">
                          {DAY_NAMES[c.day_of_week]} · {formatTimeLabel(c.start_time)} – {formatTimeLabel(c.end_time)}
                        </td>
                        <td className="px-5 py-3 text-ink-500">{c.room || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
