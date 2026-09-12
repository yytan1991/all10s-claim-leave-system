import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReceiptText, Plus, Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatusPill, EmptyState } from '../components/UI'
import { formatDate, formatMoney } from '../lib/helpers'

export default function ClaimList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('claims')
      .select('*, claim_types(name)')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [profile])

  const totalApproved = rows
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  return (
    <AppLayout title="My claims" subtitle="Track the status of your expense claims.">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">
          Approved this year: <span className="font-medium text-ink-900">{formatMoney(totalApproved)}</span>
        </p>
        <Link to="/claims/new" className="btn-primary">
          <Plus size={16} />
          New claim
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No claims submitted yet"
          description="Submit an expense claim and it will appear here with its approval status."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto"></div>
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-ink-900">{r.claim_types?.name}</td>
                  <td className="px-5 py-3 text-ink-700">{formatDate(r.claim_date)}</td>
                  <td className="px-5 py-3 text-ink-700">{formatMoney(r.amount)}</td>
                  <td className="px-5 py-3 text-ink-500 max-w-xs truncate">{r.description}</td>
                  <td className="px-5 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.attachment_url && (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs"
                      >
                        <Paperclip size={13} /> Receipt
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  )
}
