import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Receipt, AlertTriangle, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { StatCard } from '../components/UI'
import { formatMoney, toISODate } from '../lib/helpers'

export default function FinanceDashboard() {
  const { profile } = useAuth()
  const [cashflow, setCashflow] = useState([])
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    const now = new Date()
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const [{ data: cfData }, { data: paySlipData }] = await Promise.all([
      supabase
        .from('cashflow_entries')
        .select('*')
        .eq('org_id', profile.org_id)
        .gte('due_date', toISODate(rangeStart)),
      supabase
        .from('payslips')
        .select('*')
        .eq('org_id', profile.org_id),
    ])
    setCashflow(cfData || [])
    setPayslips(paySlipData || [])
    setLoading(false)
  }

  const today = toISODate(new Date())
  const thisMonthPrefix = today.slice(0, 7)

  const thisMonthIncome = cashflow
    .filter((e) => e.type === 'income' && e.status !== 'cancelled' && e.due_date.slice(0, 7) === thisMonthPrefix)
    .reduce((s, e) => s + Number(e.amount), 0)
  const thisMonthExpense = cashflow
    .filter((e) => e.type === 'expense' && e.status !== 'cancelled' && e.due_date.slice(0, 7) === thisMonthPrefix)
    .reduce((s, e) => s + Number(e.amount), 0)

  function payslipNetPay(p) {
    return (
      Number(p.basic_salary || 0) +
      (p.earnings || []).reduce((s, e) => s + Number(e.amount || 0), 0) -
      Number(p.epf_employee || 0) -
      Number(p.socso_employee || 0) -
      Number(p.eis_employee || 0) -
      Number(p.pcb || 0) -
      (p.other_deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0)
    )
  }

  const thisMonthPayslipCost = payslips
    .filter((p) => `${p.period_year}-${String(p.period_month).padStart(2, '0')}` === thisMonthPrefix)
    .reduce((s, p) => s + payslipNetPay(p), 0)

  const netPosition = thisMonthIncome - thisMonthExpense - thisMonthPayslipCost

  const overdueCount = cashflow.filter((e) => e.status === 'expected' && e.due_date < today).length

  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-MY', { month: 'short' }) }
  })
  const byMonth = months.map(({ key, label }) => {
    const income = cashflow
      .filter((e) => e.type === 'income' && e.status !== 'cancelled' && e.due_date.slice(0, 7) === key)
      .reduce((s, e) => s + Number(e.amount), 0)
    const expense = cashflow
      .filter((e) => e.type === 'expense' && e.status !== 'cancelled' && e.due_date.slice(0, 7) === key)
      .reduce((s, e) => s + Number(e.amount), 0)
    return { label, income, expense }
  })
  const maxAmount = Math.max(1, ...byMonth.flatMap((m) => [m.income, m.expense]))

  return (
    <AppLayout title="Finance" subtitle="Cash flow and payroll cost, combined.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Expected income (this month)" value={loading ? '—' : formatMoney(thisMonthIncome)} icon={Wallet} tone="brand" />
        <StatCard label="Expected expenses (this month)" value={loading ? '—' : formatMoney(thisMonthExpense)} icon={Wallet} tone="rose" />
        <StatCard label="Payroll cost (this month)" value={loading ? '—' : formatMoney(thisMonthPayslipCost)} icon={Receipt} tone="rose" />
        <StatCard
          label="Net position (this month)"
          value={loading ? '—' : formatMoney(netPosition)}
          hint={overdueCount > 0 ? `${overdueCount} overdue cash flow item(s)` : undefined}
          icon={overdueCount > 0 ? AlertTriangle : TrendingUp}
          tone={overdueCount > 0 ? 'amber' : 'brand'}
        />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-ink-900 mb-4">Income vs expenses, last 6 months</h3>
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-xs text-ink-500 mb-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Expense
              </span>
            </div>
            <div className="flex items-end justify-between gap-3 h-40">
              {byMonth.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end gap-1 h-28">
                    <div
                      className="flex-1 rounded-t bg-brand-500"
                      style={{ height: `${(m.income / maxAmount) * 100}%`, minHeight: m.income > 0 ? '4px' : '0px' }}
                    />
                    <div
                      className="flex-1 rounded-t bg-rose-400"
                      style={{ height: `${(m.expense / maxAmount) * 100}%`, minHeight: m.expense > 0 ? '4px' : '0px' }}
                    />
                  </div>
                  <span className="text-xs text-ink-500">{m.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Link to="/cashflow" className="btn-secondary text-sm">
          <Wallet size={14} /> View cash flow
        </Link>
        <Link to="/payslips-admin" className="btn-secondary text-sm">
          <Receipt size={14} /> View payslips
        </Link>
      </div>
    </AppLayout>
  )
}
