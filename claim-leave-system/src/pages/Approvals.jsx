import { useEffect, useState } from 'react'
import { Check, X, Paperclip, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatusPill, EmptyState } from '../components/UI'
import { formatDate, formatMoney } from '../lib/helpers'

const TABS = [
  { key: 'leave', label: 'Leave requests' },
  { key: 'claims', label: 'Claims' },
]

export default function Approvals() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('leave')
  const [leaveRows, setLeaveRows] = useState([])
  const [claimRows, setClaimRows] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    const [{ data: leave, error: leaveError }, { data: claims, error: claimsError }] = await Promise.all([
      supabase
        .from('leave_applications')
        .select('*, leave_types(name), profiles!leave_applications_profile_id_fkey(full_name, department)')
        .order('created_at', { ascending: false }),
      supabase
        .from('claims')
        .select('*, claim_types(name), profiles!claims_profile_id_fkey(full_name, department)')
        .order('created_at', { ascending: false }),
    ])
    if (leaveError) console.error('Leave fetch error:', leaveError)
    if (claimsError) console.error('Claims fetch error:', claimsError)
    setLeaveRows(leave || [])
    setClaimRows(claims || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function decide(table, id, status) {
    await supabase
      .from(table)
      .update({ status, approved_by: profile.id, approved_at: new Date().toISOString() })
      .eq('id', id)
    loadData()
  }

  const pendingLeave = leaveRows.filter((r) => r.status === 'pending')
  const decidedLeave = leaveRows.filter((r) => r.status !== 'pending')
  const pendingClaims = claimRows.filter((r) => r.status === 'pending')
  const decidedClaims = claimRows.filter((r) => r.status !== 'pending')

  return (
    <AppLayout title="Approvals" subtitle="Review and act on your team's leave and claim requests.">
      <div className="mb-6 flex gap-2 border-b border-sand-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
            {t.key === 'leave' && pendingLeave.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-50 text-amber-600 text-xs px-2 py-0.5">
                {pendingLeave.length}
              </span>
            )}
            {t.key === 'claims' && pendingClaims.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-50 text-amber-600 text-xs px-2 py-0.5">
                {pendingClaims.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : tab === 'leave' ? (
        <LeavePanel pending={pendingLeave} decided={decidedLeave} onDecide={decide} />
      ) : (
        <ClaimPanel pending={pendingClaims} decided={decidedClaims} onDecide={decide} />
      )}
    </AppLayout>
  )
}

function LeavePanel({ pending, decided, onDecide }) {
  if (pending.length === 0 && decided.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No leave requests yet"
        description="Once your team applies for leave, requests will show up here."
      />
    )
  }
  return (
    <div className="space-y-8">
      <Section title="Pending" empty="Nothing waiting on you — nice.">
        {pending.map((r) => (
          <div key={r.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-ink-900">
                {r.profiles?.full_name}{' '}
                <span className="font-normal text-ink-500">· {r.leave_types?.name}</span>
              </p>
              <p className="text-sm text-ink-500">
                {formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.days} day
                {r.days === 1 ? '' : 's'}
              </p>
              {r.reason && <p className="text-sm text-ink-700 mt-1">"{r.reason}"</p>}
              {r.attachment_url && (
                <a
                  href={r.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs mt-1"
                >
                  <Paperclip size={12} /> Attachment
                </a>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onDecide('leave_applications', r.id, 'approved')}
                className="btn-primary"
              >
                <Check size={15} /> Approve
              </button>
              <button
                onClick={() => onDecide('leave_applications', r.id, 'rejected')}
                className="btn-danger"
              >
                <X size={15} /> Reject
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="History">
        <HistoryTable rows={decided} type="leave" />
      </Section>
    </div>
  )
}

function ClaimPanel({ pending, decided, onDecide }) {
  if (pending.length === 0 && decided.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No claims yet"
        description="Once your team submits claims, requests will show up here."
      />
    )
  }
  return (
    <div className="space-y-8">
      <Section title="Pending" empty="Nothing waiting on you — nice.">
        {pending.map((r) => (
          <div key={r.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-ink-900">
                {r.profiles?.full_name}{' '}
                <span className="font-normal text-ink-500">· {r.claim_types?.name}</span>
              </p>
              <p className="text-sm text-ink-500">
                {formatDate(r.claim_date)} · {formatMoney(r.amount)}
              </p>
              {r.description && <p className="text-sm text-ink-700 mt-1">{r.description}</p>}
              {r.attachment_url && (
                <a
                  href={r.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs mt-1"
                >
                  <Paperclip size={12} /> Receipt
                </a>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => onDecide('claims', r.id, 'approved')} className="btn-primary">
                <Check size={15} /> Approve
              </button>
              <button onClick={() => onDecide('claims', r.id, 'rejected')} className="btn-danger">
                <X size={15} /> Reject
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="History">
        <HistoryTable rows={decided} type="claims" />
      </Section>
    </div>
  )
}

function Section({ title, empty, children }) {
  const isEmptyArray = Array.isArray(children) && children.length === 0
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3">{title}</h3>
      {isEmptyArray ? (
        <p className="text-sm text-ink-500">{empty}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  )
}

function HistoryTable({ rows, type }) {
  if (rows.length === 0) return <p className="text-sm text-ink-500">Nothing decided yet.</p>
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto"></div>
      <table className="w-full text-sm">
        <thead className="bg-sand-100 text-ink-500 text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Staff</th>
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">{type === 'leave' ? 'Dates' : 'Amount'}</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 font-medium text-ink-900">{r.profiles?.full_name}</td>
              <td className="px-5 py-3 text-ink-700">
                {type === 'leave' ? r.leave_types?.name : r.claim_types?.name}
              </td>
              <td className="px-5 py-3 text-ink-700">
                {type === 'leave'
                  ? `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`
                  : formatMoney(r.amount)}
              </td>
              <td className="px-5 py-3">
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
