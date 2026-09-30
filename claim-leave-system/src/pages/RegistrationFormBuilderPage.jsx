import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Pencil, GripVertical, ArrowUp, ArrowDown, Eye } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (choose one)' },
  { value: 'image', label: 'Photo / Image upload' },
]

export default function RegistrationFormBuilderPage() {
  const { profile } = useAuth()
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingField, setEditingField] = useState(null) // null = closed, {} = new, {...} = editing existing
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('registration_form_fields')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('section')
      .order('sort_order')
    setFields(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function deleteField(id) {
    if (!confirm('Remove this question? Already-submitted answers to it are kept, but it will no longer show on the form.')) return
    await supabase.from('registration_form_fields').delete().eq('id', id)
    load()
  }

  async function moveField(field, direction) {
    setError('')
    const sectionFields = [...fields.filter((f) => f.section === field.section)].sort(
      (a, b) => a.sort_order - b.sort_order
    )
    const idx = sectionFields.findIndex((f) => f.id === field.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sectionFields.length) return

    // Swap positions, then re-write sequential sort_order (0, 1, 2, ...)
    // for the whole section. This is self-correcting even if the stored
    // values ever drifted or duplicated, instead of just swapping two
    // raw numbers that might not actually be adjacent/unique.
    const reordered = [...sectionFields]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    const results = await Promise.all(
      reordered.map((f, i) => supabase.from('registration_form_fields').update({ sort_order: i }).eq('id', f.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      setError(failed.error.message)
      return
    }
    load()
  }

  const parentFields = fields.filter((f) => f.section === 'parent')
  const studentFields = fields.filter((f) => f.section === 'student')

  function Section({ title, sectionKey, sectionFields }) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900 text-sm">{title}</h3>
          <button
            onClick={() => setEditingField({ section: sectionKey, label: '', field_type: 'text', required: false, options: [] })}
            className="btn-secondary text-xs"
          >
            <Plus size={13} /> Add question
          </button>
        </div>
        {sectionFields.length === 0 ? (
          <p className="text-sm text-ink-500">No extra questions in this section yet.</p>
        ) : (
          <div className="space-y-2">
            {sectionFields.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-3 border border-sand-200 rounded-md px-3 py-2">
                <GripVertical size={14} className="text-ink-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-900 truncate">
                    {f.label} {f.required && <span className="text-rose-500">*</span>}
                  </p>
                  <p className="text-xs text-ink-500">{FIELD_TYPES.find((t) => t.value === f.field_type)?.label}</p>
                </div>
                <button onClick={() => moveField(f, 'up')} disabled={idx === 0} className="text-ink-400 hover:text-ink-900 disabled:opacity-30">
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => moveField(f, 'down')}
                  disabled={idx === sectionFields.length - 1}
                  className="text-ink-400 hover:text-ink-900 disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => setEditingField(f)} className="text-brand-600 hover:text-brand-700">
                  <Pencil size={14} />
                </button>
                <button onClick={() => deleteField(f.id)} className="text-rose-500 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout title="Registration Form Builder" subtitle="Add, edit, remove, and reorder extra questions on your public registration form.">
      <div className="flex justify-end mb-4">
        <a
          href={`/register?org=${profile.org_id}&preview=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm"
        >
          <Eye size={15} /> Preview form
        </a>
      </div>

      <Alert tone="amber">
        Parent name, email, phone, password, and the student's name always appear on the form and can't be removed — they're
        needed to create the login. Anything you add below appears as extra questions.
      </Alert>

      {error && (
        <div className="mt-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <>
            <Section title="Parent section — extra questions" sectionKey="parent" sectionFields={parentFields} />
            <Section title="Student section — extra questions" sectionKey="student" sectionFields={studentFields} />
          </>
        )}
      </div>

      {editingField && (
        <FieldModal
          orgId={profile.org_id}
          field={editingField}
          nextSortOrder={Math.max(-1, ...fields.filter((f) => f.section === editingField.section).map((f) => f.sort_order)) + 1}
          onClose={() => setEditingField(null)}
          onSaved={() => {
            setEditingField(null)
            load()
          }}
        />
      )}
    </AppLayout>
  )
}

function FieldModal({ orgId, field, nextSortOrder, onClose, onSaved }) {
  const isEdit = Boolean(field.id)
  const [label, setLabel] = useState(field.label || '')
  const [fieldType, setFieldType] = useState(field.field_type || 'text')
  const [required, setRequired] = useState(field.required || false)
  const [optionsText, setOptionsText] = useState((field.options || []).join('\n'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!label.trim()) {
      setError('Enter a question label.')
      return
    }
    if (fieldType === 'select' && optionsText.trim().split('\n').filter(Boolean).length < 2) {
      setError('A dropdown needs at least 2 options, one per line.')
      return
    }
    setSaving(true)

    const payload = {
      org_id: orgId,
      section: field.section,
      label: label.trim(),
      field_type: fieldType,
      required,
      options: fieldType === 'select' ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
    }

    const { error: saveError } = isEdit
      ? await supabase.from('registration_form_fields').update(payload).eq('id', field.id)
      : await supabase.from('registration_form_fields').insert({ ...payload, sort_order: nextSortOrder })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">{isEdit ? 'Edit question' : 'Add question'}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}
          <div>
            <label className="field-label">Question label</label>
            <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Allergies" />
          </div>
          <div>
            <label className="field-label">Answer type</label>
            <select className="field-input" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {fieldType === 'select' && (
            <div>
              <label className="field-label">Options (one per line)</label>
              <textarea
                className="field-input min-h-[90px]"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={'Option A\nOption B\nOption C'}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required — parent must answer this to submit
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add question'}
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
