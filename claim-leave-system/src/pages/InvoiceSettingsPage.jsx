import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert } from '../components/UI'

export default function InvoiceSettingsPage() {
  const [tab, setTab] = useState('discounts')

  return (
    <AppLayout title="Invoice Setting" subtitle="Reusable discount, tax, remark, and payment method options for invoices.">
      <div className="mb-6 flex gap-2 border-b border-sand-200 flex-wrap">
        {[
          { key: 'discounts', label: 'Discount Items' },
          { key: 'tax', label: 'Tax Items' },
          { key: 'remarks', label: 'Remark Templates' },
          { key: 'payment', label: 'Payment Options' },
        ].map((t) => (
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
          </button>
        ))}
      </div>

      {tab === 'discounts' && <ValueItemManager table="invoice_discount_items" label="discount" />}
      {tab === 'tax' && <ValueItemManager table="invoice_tax_items" label="tax" />}
      {tab === 'remarks' && <RemarkTemplateManager />}
      {tab === 'payment' && <PaymentMethodManager />}
    </AppLayout>
  )
}

// Shared by Discount Items and Tax Items — both are "name + fixed RM or %" rows.
function ValueItemManager({ table, label }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [type, setType] = useState('fixed')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from(table).select('*').eq('org_id', profile.org_id).order('name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function addItem(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || value === '') {
      setError('Enter a name and a value.')
      return
    }
    const { error: insertError } = await supabase.from(table).insert({
      org_id: profile.org_id,
      name: name.trim(),
      type,
      value: Number(value),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    setValue('')
    load()
  }

  async function removeItem(id) {
    if (!confirm(`Remove this ${label} item?`)) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={addItem} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={label === 'discount' ? 'e.g. Sibling Discount' : 'e.g. SST'}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Type</label>
            <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="fixed">Fixed (RM)</option>
              <option value="percent">Percentage (%)</option>
            </select>
          </div>
          <div>
            <label className="field-label">Value</label>
            <input
              type="number"
              step="0.01"
              className="field-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'percent' ? 'e.g. 6' : 'e.g. 20'}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add {label} item
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No {label} items yet.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{r.name}</p>
                  <p className="text-xs text-ink-500">
                    {r.type === 'percent' ? `${r.value}%` : `RM ${Number(r.value).toFixed(2)}`}
                  </p>
                </div>
                <button onClick={() => removeItem(r.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function RemarkTemplateManager() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoice_remark_templates')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function addTemplate(e) {
    e.preventDefault()
    setError('')
    if (!text.trim()) return
    const { error: insertError } = await supabase
      .from('invoice_remark_templates')
      .insert({ org_id: profile.org_id, text: text.trim() })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setText('')
    load()
  }

  async function removeTemplate(id) {
    if (!confirm('Remove this remark template?')) return
    await supabase.from('invoice_remark_templates').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={addTemplate} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Remark text</label>
          <textarea
            className="field-input min-h-[70px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Payment due within 7 days of issue."
          />
        </div>
        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add remark
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No remark templates yet.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <p className="text-sm text-ink-900">{r.text}</p>
                <button onClick={() => removeTemplate(r.id)} className="text-rose-500 hover:text-rose-600 shrink-0">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PaymentMethodManager() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoice_payment_methods')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function addMethod(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    const { error: insertError } = await supabase
      .from('invoice_payment_methods')
      .insert({ org_id: profile.org_id, name: name.trim() })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setName('')
    load()
  }

  async function removeMethod(id) {
    if (!confirm('Remove this payment method?')) return
    await supabase.from('invoice_payment_methods').delete().eq('id', id)
    load()
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={addMethod} className="card p-5 space-y-4">
        {error && <Alert tone="rose">{error}</Alert>}
        <div>
          <label className="field-label">Payment method name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bank Transfer, Cash, DuitNow"
          />
        </div>
        <button type="submit" className="btn-primary">
          <Plus size={15} /> Add payment method
        </button>
      </form>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No payment methods yet.</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-ink-900">{r.name}</p>
                <button onClick={() => removeMethod(r.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
