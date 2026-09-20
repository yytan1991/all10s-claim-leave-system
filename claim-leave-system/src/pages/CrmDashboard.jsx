import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, TrendingUp, CircleCheck, CircleX, AlarmClock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatCard } from '../components/UI'
import { stagePillClass, formatDate, toISODate } from '../lib/helpers'

export default function CrmDashboard() {
  const { profile, isManager } = useAuth()
  const [stages, setStages] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    const [{ data: stageData }, { data: contactData }] = await Promise.all([
      supabase.from('crm_stages').select('*').eq('org_id', profile.org_id).order('sort_order'),
      supabase
        .from('crm_contacts')
        .select(
          'id, stage_id, updated_at, parent_name, next_followup_date, pic_id, crm_stages(name, is_won, is_lost), profiles!crm_contacts_pic_id_fkey(full_name)'
        )
        .eq('org_id', profile.org_id),
    ])
    setStages(stageData || [])
    setContacts(contactData || [])
    setLoading(false)
  }

  const counts = stages.map((s) => ({
    stage: s,
    count: contacts.filter((c) => c.stage_id === s.id).length,
  }))
  const maxCount = Math.max(1, ...counts.map((c) => c.count))

  const totalLeads = contacts.length
  const wonCount = contacts.filter((c) => c.crm_stages?.is_won).length
  const lostCount = contacts.filter((c) => c.crm_stages?.is_lost).length
  const openCount = totalLeads - wonCount - lostCount
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null

  // Closed-won per month, last 6 months
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-MY', { month: 'short' }) }
  })
  const wonByMonth = months.map(({ key, label }) => {
    const count = contacts.filter(
      (c) => c.crm_stages?.is_won && c.updated_at && c.updated_at.slice(0, 7) === key
    ).length
    return { label, count }
  })
  const maxWon = Math.max(1, ...wonByMonth.map((m) => m.count))

  // Follow-up reminders — only open leads (not won/lost) with a date set.
  // RLS already scopes `contacts` to just this person's own leads unless
  // they're a manager/admin, so no extra filtering by PIC is needed here.
  const today = toISODate(new Date())
  const sevenDaysOut = toISODate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  const openWithFollowup = contacts.filter(
    (c) => c.next_followup_date && !c.crm_stages?.is_won && !c.crm_stages?.is_lost
  )
  const overdue = openWithFollowup
    .filter((c) => c.next_followup_date < today)
    .sort((a, b) => a.next_followup_date.localeCompare(b.next_followup_date))
  const dueSoon = openWithFollowup
    .filter((c) => c.next_followup_date >= today && c.next_followup_date <= sevenDaysOut)
    .sort((a, b) => a.next_followup_date.localeCompare(b.next_followup_date))

  return (
    <AppLayout title="Sales pipeline" subtitle="Where every lead stands, at a glance.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total leads" value={loading ? '—' : totalLeads} icon={Users2} tone="brand" />
        <StatCard label="Open in pipeline" value={loading ? '—' : openCount} icon={TrendingUp} tone="amber" />
        <StatCard label="Closed won" value={loading ? '—' : wonCount} icon={CircleCheck} tone="brand" />
        <StatCard
          label="Win rate"
          value={loading ? '—' : winRate == null ? '—' : `${winRate}%`}
          hint={loading ? undefined : `${lostCount} closed lost`}
          icon={CircleX}
          tone="rose"
        />
      </div>

      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="card p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <AlarmClock size={17} className="text-amber-500" />
            <h3 className="font-semibold text-ink-900">Follow-up reminders</h3>
          </div>
          <div className="space-y-2">
            {overdue.map((c) => (
              <Link
                key={c.id}
                to={`/crm/leads/${c.id}`}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-sand-50"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{c.parent_name}</p>
                  <p className="text-xs text-ink-500">
                    {isManager && c.profiles?.full_name ? `${c.profiles.full_name} · ` : ''}
                    Due {formatDate(c.next_followup_date)}
                  </p>
                </div>
                <span className="badge-rejected">Overdue</span>
              </Link>
            ))}
            {dueSoon.map((c) => (
              <Link
                key={c.id}
                to={`/crm/leads/${c.id}`}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-sand-50"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{c.parent_name}</p>
                  <p className="text-xs text-ink-500">
                    {isManager && c.profiles?.full_name ? `${c.profiles.full_name} · ` : ''}
                    Due {formatDate(c.next_followup_date)}
                  </p>
                </div>
                <span className="badge-pending">Due soon</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">Pipeline by stage</h3>
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <div className="space-y-3">
              {counts.map(({ stage, count }, i) => (
                <div key={stage.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={`badge ${stagePillClass(stage, i)}`}>{stage.name}</span>
                    <span className="text-ink-500">{count}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-sand-100">
                    <div
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">Closed won, last 6 months</h3>
          {loading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-40">
              {wonByMonth.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs text-ink-500">{m.count}</span>
                  <div className="w-full flex items-end h-28">
                    <div
                      className="w-full rounded-t bg-brand-500"
                      style={{ height: `${(m.count / maxWon) * 100}%`, minHeight: m.count > 0 ? '4px' : '0px' }}
                    />
                  </div>
                  <span className="text-xs text-ink-500">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Link to="/crm/leads" className="btn-secondary text-sm">
          View all leads
        </Link>
      </div>
    </AppLayout>
  )
}
