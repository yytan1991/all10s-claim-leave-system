import { useEffect, useState } from 'react'
import { Download, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { EmptyState } from '../components/UI'
import { formatMoney } from '../lib/helpers'
import { generatePayslipPdf, monthLabel } from '../lib/payslipPdf'

export default function MyPayslips() {
  const { profile } = useAuth()
  const [payslips, setPayslips] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function load() {
    setLoading(true)
    const [{ data: slipData }, { data: orgData }] = await Promise.all([
      supabase
        .from('payslips')
        .select('*')
        .eq('profile_id', profile.id)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false }),
      supabase.from('organizations').select('*').eq('id', profile.org_id).single(),
    ])
    setPayslips(slipData || [])
    setOrg(orgData || null)
    setLoading(false)
  }

  function netPayOf(slip) {
    return (
      Number(slip.basic_salary || 0) +
      (slip.earnings || []).reduce((s, e) => s + Number(e.amount || 0), 0) -
      Number(slip.epf_employee || 0) -
      Number(slip.socso_employee || 0) -
      Number(slip.eis_employee || 0) -
      Number(slip.pcb || 0) -
      (slip.other_deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0)
    )
  }

  return (
    <AppLayout title="My Payslips" subtitle="Download your monthly payslips.">
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : payslips.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payslips yet"
          description="Once your admin generates a payslip for you, it will show up here."
        />
      ) : (
        <div className="card divide-y divide-sand-100">
          {payslips.map((slip) => (
            <div key={slip.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-ink-900">{monthLabel(slip.period_month, slip.period_year)}</p>
                <p className="text-sm text-ink-500">Net pay: {formatMoney(netPayOf(slip))}</p>
              </div>
              <button
                onClick={() => generatePayslipPdf(slip, org, profile)}
                className="btn-secondary text-sm"
              >
                <Download size={15} /> Download PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
