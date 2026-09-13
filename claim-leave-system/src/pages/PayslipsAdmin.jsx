import { useEffect, useState } from 'react'
import { Plus, Trash2, Download, Pencil, X, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState, StatusPill } from '../components/UI'
import { formatMoney } from '../lib/helpers'
import { generatePayslipPdf, monthLabel } from '../lib/payslipPdf'

function currentMonthYear() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export default function PayslipsAdmin() {
  const { profile } = useAuth()
  const [{ month, year }, setPeriod] = useState(currentMonthYear())
  const [employees, setEmployees] = useState([])
  const [payslips, setPayslips] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id, month, year])

  async function load() {
    setLoading(true)
    const [{ data: empData }, { data: slipData }, { data: orgData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('org_id', profile.org_id).order('full_name'),
      supabase
        .from('payslips')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('period_month', month)
        .eq('period_year', year),
      supabase.from('organizations').select('*').eq('id', profile.org_id).single(),
    ])
    setEmployees(empData || [])
    setPayslips(slipData || [])
    setOrg(orgData || null)
    setLoading(false)
  }

  function payslipFor(empId) {
    return payslips.find((p) => p.profile_id === empId) || null
  }

  function downloadPdf(employee, payslip) {
    generatePayslipPdf(payslip, org, employee)
  }

  async function deletePayslip(id) {
    if (!confirm('Delete this payslip? This cannot be undone.')) return
    await supabase.from('payslips').delete().eq('id', id)
    load()
  }

  return (
    <AppLayout title="Payslips" subtitle="Generate and manage monthly payslips for your staff.">
      <div className="flex items-center gap-3 mb-6">
        <select
          className="field-input w-auto"
          value={month}
          onChange={(e) => setPeriod({ month: Number(e.target.value), year })}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {monthLabel(i + 1, year).split(' ')[0]}
            </option>
          ))}
        </select>
        <select
          className="field-input w-auto"
          value={year}
          onChange={(e) => setPeriod({ month, year: Number(e.target.value) })}
        >
          {Array.from({ length: 5 }, (_, i) => currentMonthYear().year - 2 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : employees.length === 0 ? (
        <EmptyState icon={Receipt} title="No staff found" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Staff</th>
                  <th className="px-5 py-3 font-medium">Basic Salary</th>
                  <th className="px-5 py-3 font-medium">Net Pay</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {employees.map((emp) => {
                  const slip = payslipFor(emp.id)
                  const netPay = slip
                    ? Number(slip.basic_salary || 0) +
                      (slip.earnings || []).reduce((s, e) => s + Number(e.amount || 0), 0) -
                      Number(slip.epf_employee || 0) -
                      Number(slip.socso_employee || 0) -
                      Number(slip.eis_employee || 0) -
                      Number(slip.pcb || 0) -
                      (slip.other_deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0)
                    : null
                  return (
                    <tr key={emp.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">{emp.full_name}</td>
                      <td className="px-5 py-3 text-ink-700">{slip ? formatMoney(slip.basic_salary) : '—'}</td>
                      <td className="px-5 py-3 text-ink-700 font-medium">
                        {netPay != null ? formatMoney(netPay) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={slip ? 'approved' : 'pending'} />
                      </td>
                      <td className="px-5 py-3 text-right space-x-3">
                        {slip && (
                          <>
                            <button
                              onClick={() => downloadPdf(emp, slip)}
                              className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs font-medium"
                            >
                              <Download size={13} /> PDF
                            </button>
                            <button
                              onClick={() => deletePayslip(slip.id)}
                              className="inline-flex items-center gap-1 text-rose-500 hover:underline text-xs font-medium"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setEditing({ employee: emp, payslip: slip })}
                          className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs font-medium"
                        >
                          <Pencil size={13} /> {slip ? 'Edit' : 'Create'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <PayslipFormModal
          employee={editing.employee}
          payslip={editing.payslip}
          month={month}
          year={year}
          orgId={profile.org_id}
          profile={profile}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}

function PayslipFormModal({ employee, payslip, month, year, orgId, profile, onClose, onSaved }) {
  const [basicSalary, setBasicSalary] = useState(payslip?.basic_salary || '')
  const [earnings, setEarnings] = useState(payslip?.earnings || [])
  const [epfEmployee, setEpfEmployee] = useState(payslip?.epf_employee || '')
  const [epfEmployer, setEpfEmployer] = useState(payslip?.epf_employer || '')
  const [socsoEmployee, setSocsoEmployee] = useState(payslip?.socso_employee || '')
  const [socsoEmployer, setSocsoEmployer] = useState(payslip?.socso_employer || '')
  const [eisEmployee, setEisEmployee] = useState(payslip?.eis_employee || '')
  const [eisEmployer, setEisEmployer] = useState(payslip?.eis_employer || '')
  const [pcb, setPcb] = useState(payslip?.pcb || '')
  const [otherDeductions, setOtherDeductions] = useState(payslip?.other_deductions || [])
  const [notes, setNotes] = useState(payslip?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const grossPay = Number(basicSalary || 0) + earnings.reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalDeductions =
    Number(epfEmployee || 0) +
    Number(socsoEmployee || 0) +
    Number(eisEmployee || 0) +
    Number(pcb || 0) +
    otherDeductions.reduce((s, d) => s + Number(d.amount || 0), 0)
  const netPay = grossPay - totalDeductions

  function updateItem(list, setList, index, field, value) {
    setList(list.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      org_id: orgId,
      profile_id: employee.id,
      period_month: month,
      period_year: year,
      basic_salary: Number(basicSalary) || 0,
      earnings: earnings.filter((i) => i.label),
      epf_employee: Number(epfEmployee) || 0,
      epf_employer: Number(epfEmployer) || 0,
      socso_employee: Number(socsoEmployee) || 0,
      socso_employer: Number(socsoEmployer) || 0,
      eis_employee: Number(eisEmployee) || 0,
      eis_employer: Number(eisEmployer) || 0,
      pcb: Number(pcb) || 0,
      other_deductions: otherDeductions.filter((i) => i.label),
      notes: notes || null,
      created_by: profile.id,
    }

    const { error: upsertError } = await supabase
      .from('payslips')
      .upsert(payload, { onConflict: 'profile_id,period_month,period_year' })

    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">
            {payslip ? 'Edit' : 'Create'} payslip · {employee.full_name} · {monthLabel(month, year)}
          </h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {error && <Alert tone="rose">{error}</Alert>}

          <div>
            <label className="field-label">Basic salary (RM)</label>
            <input
              type="number"
              step="0.01"
              className="field-input max-w-xs"
              value={basicSalary}
              onChange={(e) => setBasicSalary(e.target.value)}
            />
          </div>

          <ItemList
            title="Other earnings (overtime, allowance, bonus, etc.)"
            items={earnings}
            onAdd={() => setEarnings([...earnings, { label: '', amount: '' }])}
            onRemove={(i) => setEarnings(earnings.filter((_, idx) => idx !== i))}
            onChange={(i, field, value) => updateItem(earnings, setEarnings, i, field, value)}
          />

          <div>
            <p className="field-label mb-2">Statutory deductions (employee share)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NumField label="EPF" value={epfEmployee} onChange={setEpfEmployee} />
              <NumField label="SOCSO" value={socsoEmployee} onChange={setSocsoEmployee} />
              <NumField label="EIS" value={eisEmployee} onChange={setEisEmployee} />
              <NumField label="PCB" value={pcb} onChange={setPcb} />
            </div>
          </div>

          <div>
            <p className="field-label mb-2">
              Employer contributions <span className="text-ink-500 font-normal">(shown for info only, doesn't affect net pay)</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="EPF" value={epfEmployer} onChange={setEpfEmployer} />
              <NumField label="SOCSO" value={socsoEmployer} onChange={setSocsoEmployer} />
              <NumField label="EIS" value={eisEmployer} onChange={setEisEmployer} />
            </div>
          </div>

          <ItemList
            title="Other deductions (advance, loan repayment, etc.)"
            items={otherDeductions}
            onAdd={() => setOtherDeductions([...otherDeductions, { label: '', amount: '' }])}
            onRemove={(i) => setOtherDeductions(otherDeductions.filter((_, idx) => idx !== i))}
            onChange={(i, field, value) => updateItem(otherDeductions, setOtherDeductions, i, field, value)}
          />

          <div>
            <label className="field-label">Notes (optional, shown on payslip)</label>
            <textarea className="field-input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="card p-4 bg-sand-50 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Gross Pay</span>
              <span className="font-medium">{formatMoney(grossPay)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Total Deductions</span>
              <span className="font-medium">{formatMoney(totalDeductions)}</span>
            </div>
            <div className="flex justify-between text-base pt-1 border-t border-sand-200">
              <span className="font-semibold text-ink-900">Net Pay</span>
              <span className="font-semibold text-ink-900">{formatMoney(netPay)}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save payslip'}
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

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-ink-500 mb-1 block">{label}</label>
      <input
        type="number"
        step="0.01"
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function ItemList({ title, items, onAdd, onRemove, onChange }) {
  return (
    <div>
      <p className="field-label mb-2">{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="field-input flex-1"
              placeholder="Label"
              value={item.label}
              onChange={(e) => onChange(i, 'label', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="field-input w-32"
              placeholder="Amount"
              value={item.amount}
              onChange={(e) => onChange(i, 'amount', e.target.value)}
            />
            <button type="button" onClick={() => onRemove(i)} className="text-rose-500 hover:text-rose-600 px-1">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="btn-secondary text-xs mt-2">
        <Plus size={13} /> Add item
      </button>
    </div>
  )
}
