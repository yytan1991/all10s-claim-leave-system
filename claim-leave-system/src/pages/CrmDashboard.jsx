import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, TrendingUp, CircleCheck, CircleX } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import AppLayout from '../components/AppLayout'
import { StatCard } from '../components/UI'
import { stagePillClass } from '../lib/helpers'

export default function CrmDashboard() {
  const [stages, setStages] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: stageData }, { data: contactData }] = await Promise.all([
      supabase.from('crm_stages').select('*').order('sort_order'),
      supabase.from('crm_contacts').select('id, stage_id, updated_at, crm_stages(name, is_won, is_lost)'),
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
