import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Plus, Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatusPill, EmptyState } from '../components/UI'
import { formatDate } from '../lib/helpers'

export default function LeaveList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('leave_applications')
      .select('*, leave_types(name)')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [profile])

  async function cancelApplication(id) {
    if (!confirm('Cancel this leave application?')) return
    await supabase.from('leave_applications').update({ status: 'cancelled' }).eq('id', id)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
  }

  return (
    <AppLayout title="My leave" subtitle="Track the status of your leave applications.">
      <div className="flex justify-end mb-4">
        <Link to="/leave/apply" className="btn-primary">
          <Plus size={16} />
          Apply for leave
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No leave applications yet"
          description="Once you apply for leave, it will show up here with its approval status."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Dates</th>
                <th className="px-5 py-3 font-medium">Days</th>
                <th className="px-5 py-3 font-medium">Reason</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-ink-900">{r.leave_types?.name}</td>
                  <td className="px-5 py-3 text-ink-700">
                    {formatDate(r.start_date)} – {formatDate(r.end_date)}
                  </td>
                  <td className="px-5 py-3 text-ink-700">{r.days}</td>
                  <td className="px-5 py-3 text-ink-500 max-w-xs truncate">{r.reason}</td>
                  <td className="px-5 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3 text-right space-x-3">
                    {r.attachment_url && (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs"
                      >
                        <Paperclip size={13} /> File
                      </a>
                    )}
                    {r.status === 'pending' && (
                      <button
                        onClick={() => cancelApplication(r.id)}
                        className="text-xs text-rose-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
