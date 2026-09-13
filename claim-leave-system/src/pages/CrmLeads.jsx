import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Plus, Download, Upload, Users2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { stagePillClass, isOverdue } from '../lib/helpers'

export default function CrmLeads() {
  const { profile, isManager } = useAuth()
  const [stages, setStages] = useState([])
  const [staff, setStaff] = useState([])
  const [contacts, setContacts] = useState([])
  const [stageFilter, setStageFilter] = useState('all')
  const [picFilter, setPicFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: stageData }, { data: staffData }, { data: contactData }] = await Promise.all([
      supabase.from('crm_stages').select('*').order('sort_order'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase
        .from('crm_contacts')
        .select('*, crm_stages(name, is_won, is_lost), profiles!crm_contacts_pic_id_fkey(full_name)')
        .order('next_followup_date', { ascending: true, nullsFirst: false }),
    ])
    setStages(stageData || [])
    setStaff(staffData || [])
    setContacts(contactData || [])
    setLoading(false)
  }

  async function updateField(contactId, field, value) {
    const { error: updateError } = await supabase
      .from('crm_contacts')
      .update({ [field]: value })
      .eq('id', contactId)
    if (updateError) {
      setError(updateError.message)
    }
    load()
  }

  const filtered = contacts.filter((c) => {
    if (stageFilter !== 'all' && c.stage_id !== stageFilter) return false
    if (picFilter !== 'all' && c.pic_id !== picFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = `${c.parent_name} ${c.student_name || ''} ${c.school || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  function exportExcel() {
    const rows = filtered.map((c) => ({
      'Parent Name': c.parent_name,
      'Parent Contact': c.parent_contact || '',
      'Student Name': c.student_name || '',
      'Student Year': c.student_year || '',
      School: c.school || '',
      'Service Interested': c.service_interested || '',
      'Lead Source': c.lead_source || '',
      Stage: c.crm_stages?.name || '',
      PIC: c.profiles?.full_name || '',
      'First Contact': c.first_contact_date || '',
      'Next Follow-up': c.next_followup_date || '',
      Notes: c.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Leads')
    XLSX.writeFile(wb, `crm-leads-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setNotice('')

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)

      if (rows.length === 0) {
        setError('That file has no rows to import.')
        return
      }

      const stageByName = Object.fromEntries(stages.map((s) => [s.name.toLowerCase(), s.id]))
      const staffByName = Object.fromEntries(staff.map((s) => [s.full_name.toLowerCase(), s.id]))

      const payload = rows
        .map((r) => {
          const parentName = r['Parent Name'] || r['parent_name'] || r['Parent']
          if (!parentName) return null
          return {
            parent_name: String(parentName),
            parent_contact: r['Parent Contact'] || r['Contact'] || null,
            student_name: r['Student Name'] || null,
            student_year: r['Student Year'] ? String(r['Student Year']) : null,
            school: r['School'] || null,
            service_interested: r['Service Interested'] || r['Service'] || null,
            lead_source: r['Lead Source'] || r['Source'] || null,
            stage_id: stageByName[String(r['Stage'] || '').toLowerCase()] || stages[0]?.id || null,
            pic_id: staffByName[String(r['PIC'] || '').toLowerCase()] || profile.id,
            first_contact_date: normalizeDate(r['First Contact']) || null,
            next_followup_date: normalizeDate(r['Next Follow-up']) || null,
            notes: r['Notes'] || null,
            created_by: profile.id,
          }
        })
        .filter(Boolean)

      if (payload.length === 0) {
        setError('No valid rows found — make sure there\'s a "Parent Name" column.')
        return
      }

      const { error: insertError } = await supabase.from('crm_contacts').insert(payload)
      if (insertError) {
        setError(insertError.message)
        return
      }
      setNotice(`Imported ${payload.length} lead${payload.length === 1 ? '' : 's'}.`)
      load()
    } catch (err) {
      setError('Could not read that file. Make sure it\'s a valid .xlsx or .csv export.')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <AppLayout title="Leads" subtitle="All parent/student enquiries in your sales pipeline.">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <input
          className="field-input sm:max-w-xs"
          placeholder="Search parent, student, school…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="field-input sm:w-44" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {isManager && (
          <select className="field-input sm:w-44" value={picFilter} onChange={(e) => setPicFilter(e.target.value)}>
            <option value="all">All PICs</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          ref={fileInputRef}
          onChange={handleImportFile}
          className="hidden"
        />
        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-sm">
          <Upload size={15} /> Import Excel
        </button>
        <button onClick={exportExcel} className="btn-secondary text-sm">
          <Download size={15} /> Export Excel
        </button>
        <Link to="/crm/leads/new" className="btn-primary text-sm">
          <Plus size={15} /> New lead
        </Link>
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      {notice && !error && (
        <div className="mb-4">
          <Alert tone="brand">{notice}</Alert>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No leads found"
          description="Add your first lead, or import from an Excel export."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-sand-100 text-ink-500 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Parent</th>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">School</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium">PIC</th>
                <th className="px-5 py-3 font-medium">Next follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {filtered.map((c) => {
                const stageIndex = stages.findIndex((s) => s.id === c.stage_id)
                const overdue = isOverdue(c.next_followup_date) && !c.crm_stages?.is_won && !c.crm_stages?.is_lost
                return (
                  <tr key={c.id} className="hover:bg-sand-50 cursor-pointer">
                    <td className="px-5 py-3">
                      <Link to={`/crm/leads/${c.id}`} className="font-medium text-ink-900 hover:underline">
                        {c.parent_name}
                      </Link>
                      {c.parent_contact && <p className="text-xs text-ink-500">{c.parent_contact}</p>}
                    </td>
                    <td className="px-5 py-3 text-ink-700">
                      {c.student_name || '—'}
                      {c.student_year && <span className="text-ink-500"> · {c.student_year}</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-500">{c.school || '—'}</td>
                    <td className="px-5 py-3">
                      <select
                        value={c.stage_id || ''}
                        onChange={(e) => updateField(c.id, 'stage_id', e.target.value)}
                        className={`badge border-0 cursor-pointer ${stagePillClass(c.crm_stages, stageIndex)}`}
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-ink-700">
                      {isManager ? (
                        <select
                          value={c.pic_id || ''}
                          onChange={(e) => updateField(c.id, 'pic_id', e.target.value || null)}
                          className="field-input py-1 text-xs w-32"
                        >
                          <option value="">Unassigned</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        c.profiles?.full_name || '—'
                      )}
                    </td>
                    <td className={`px-5 py-3 font-medium ${overdue ? 'text-rose-600' : 'text-ink-700'}`}>
                      <input
                        type="date"
                        value={c.next_followup_date || ''}
                        onChange={(e) => updateField(c.id, 'next_followup_date', e.target.value || null)}
                        className={`bg-transparent border-0 p-0 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 rounded ${
                          overdue ? 'text-rose-600' : 'text-ink-700'
                        }`}
                      />
                      {overdue && <span className="ml-1.5 text-xs">(overdue)</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

// Converts common date shapes (Excel serials, "DD/MM/YYYY", ISO) to ISO "YYYY-MM-DD".
function normalizeDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(value).trim()
  const isoMatch = str.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
