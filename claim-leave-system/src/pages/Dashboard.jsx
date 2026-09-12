import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ReceiptText, ClipboardCheck, Clock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatCard, StatusPill, EmptyState } from '../components/UI'
import { formatDate, formatMoney } from '../lib/helpers'

export default function Dashboard() {
  const { profile, isManager } = useAuth()
  const [balances, setBalances] = useState([])
  const [recentLeave, setRecentLeave] = useState([])
  const [recentClaims, setRecentClaims] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    const year = new Date().getFullYear()

    async function load() {
      setLoading(true)

      const balancesReq = supabase
        .from('leave_balances')
        .select('*, leave_types(name)')
        .eq('profile_id', profile.id)
        .eq('year', year)

      const leaveReq = supabase
        .from('leave_applications')
        .select('*, leave_types(name)')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const claimsReq = supabase
        .from('claims')
        .select('*, claim_types(name)')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const [{ data: balanceData }, { data: leaveData }, { data: claimData }] = await Promise.all([
        balancesReq,
        leaveReq,
        claimsReq,
      ])

      setBalances(balanceData || [])
      setRecentLeave(leaveData || [])
      setRecentClaims(claimData || [])

      if (isManager) {
        const { count: leaveCount } = await supabase
          .from('leave_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        const { count: claimCount } = await supabase
          .from('claims')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        setPendingApprovals((leaveCount || 0) + (claimCount || 0))
      }

      setLoading(false)
    }

    load()
  }, [profile, isManager])

  const totalRemaining = balances.reduce(
    (sum, b) => sum + (b.entitled_days - b.used_days),
    0
  )
  const pendingClaimsCount = recentClaims.filter((c) => c.status === 'pending').length
  const pendingLeaveCount = recentLeave.filter((l) => l.status === 'pending').length

  return (
    <AppLayout
      title={`Welcome back, ${profile?.full_name?.split(' ')[0] || ''}`}
      subtitle="Here's what's happening with your leave and claims."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Leave days remaining"
          value={loading ? '—' : totalRemaining}
          hint={`${new Date().getFullYear()} entitlement`}
          icon={CalendarDays}
          tone="brand"
        />
        <StatCard
          label="My pending leave"
          value={loading ? '—' : pendingLeaveCount}
          hint="Awaiting approval"
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="My pending claims"
          value={loading ? '—' : pendingClaimsCount}
          hint="Awaiting approval"
          icon={ReceiptText}
          tone="amber"
        />
        {isManager && (
          <Link to="/approvals">
            <StatCard
              label="Awaiting your review"
              value={loading ? '—' : pendingApprovals}
              hint="Team-wide, leave + claims"
              icon={ClipboardCheck}
              tone="rose"
            />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {balances.length > 0
          ? balances.map((b) => {
              const remaining = b.entitled_days - b.used_days
              const pct = b.entitled_days ? Math.min(100, (b.used_days / b.entitled_days) * 100) : 0
              return (
                <div key={b.id} className="card p-5">
                  <p className="text-sm text-ink-500">{b.leave_types?.name}</p>
                  <p className="mt-1 text-xl font-semibold font-display">
                    {remaining} <span className="text-sm font-normal text-ink-500">days left</span>
                  </p>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-sand-100">
                    <div
                      className="h-1.5 rounded-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    {b.used_days} used of {b.entitled_days}
                  </p>
                </div>
              )
            })
          : !loading && (
              <div className="lg:col-span-3">
                <EmptyState
                  icon={CalendarDays}
                  title="No leave balance set up yet"
                  description="Ask your admin to assign your annual leave entitlement."
                />
              </div>
            )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-sand-200">
            <h3 className="font-semibold text-ink-900">Recent leave applications</h3>
            <Link to="/leave" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {recentLeave.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500 text-center">No leave applied yet.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {recentLeave.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{l.leave_types?.name}</p>
                    <p className="text-xs text-ink-500">
                      {formatDate(l.start_date)} – {formatDate(l.end_date)}
                    </p>
                  </div>
                  <StatusPill status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-sand-200">
            <h3 className="font-semibold text-ink-900">Recent claims</h3>
            <Link to="/claims" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {recentClaims.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500 text-center">No claims submitted yet.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {recentClaims.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{c.claim_types?.name}</p>
                    <p className="text-xs text-ink-500">{formatDate(c.claim_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-900">{formatMoney(c.amount)}</p>
                    <StatusPill status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
