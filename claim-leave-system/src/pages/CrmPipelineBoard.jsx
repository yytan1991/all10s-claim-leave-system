import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { initials, isOverdue } from '../lib/helpers'

// "30 Sep" (with the year only when it isn't this year): short enough for a narrow card.
function shortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }) })
}

export default function CrmPipelineBoard() {
  const { profile } = useAuth()
  const [stages, setStages] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOverStage, setDragOverStage] = useState(null)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    const [{ data: stageData }, { data: contactData }] = await Promise.all([
      supabase.from('crm_stages').select('*').eq('org_id', profile.org_id).order('sort_order'),
      supabase
        .from('crm_contacts')
        .select('id, parent_name, student_name, stage_id, next_followup_date, profiles!crm_contacts_pic_id_fkey(full_name)')
        .eq('org_id', profile.org_id),
    ])
    setStages(stageData || [])
    setContacts(contactData || [])
    setLoading(false)
  }

  function handleDrop(e, stageId) {
    e.preventDefault()
    setDragOverStage(null)
    const contactId = e.dataTransfer.getData('text/plain')
    if (!contactId) return

    // Optimistic update so the card moves instantly.
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, stage_id: stageId } : c)))
    supabase.from('crm_contacts').update({ stage_id: stageId }).eq('id', contactId).then()
  }

  if (loading) {
    return (
      <AppLayout title="Pipeline board" subtitle="Drag a lead's card to move it between stages.">
        <p className="text-sm text-ink-500">Loading…</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="Pipeline board"
      subtitle="Drag a lead's card to move it between stages."
      actions={
        <Link to="/crm/leads/new" className="btn-primary text-xs">
          <Plus size={14} /> New lead
        </Link>
      }
    >
      {stages.length === 0 ? (
        <p className="text-sm text-ink-500">No pipeline stages have been set up yet.</p>
      ) : (
        // The stages share the width of the page, so the whole board is visible at once. Only if there are so many
        // stages that each would get squeezed below about 7.5rem does it scroll sideways.
        <div data-board className="grid auto-cols-[minmax(7.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const stageContacts = contacts.filter((c) => c.stage_id === stage.id)
            const isOver = dragOverStage === stage.id
            const accent = stage.is_won ? 'border-emerald-400' : stage.is_lost ? 'border-rose-400' : 'border-brand-300'
            return (
              <div
                key={stage.id}
                data-stage={stage.name}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverStage(stage.id)
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`flex min-w-0 flex-col rounded-2xl border-t-4 shadow-card ${accent} ${isOver ? 'bg-brand-50' : 'bg-white/60'}`}
              >
                <div className="flex items-start justify-between gap-1 px-2 pb-1.5 pt-2">
                  <p className="break-words text-xs font-semibold leading-tight text-ink-900">{stage.name}</p>
                  <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[11px] leading-none text-ink-500">{stageContacts.length}</span>
                </div>

                {/* each stage scrolls up and down by itself if it has many leads */}
                <div className="max-h-[calc(100vh-17rem)] min-h-[8rem] space-y-1.5 overflow-y-auto p-1.5">
                  {stageContacts.map((c) => {
                    const overdue = isOverdue(c.next_followup_date) && !stage.is_won && !stage.is_lost
                    return (
                      <Link
                        key={c.id}
                        to={`/crm/leads/${c.id}`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                        title={[c.parent_name, c.student_name].filter(Boolean).join(' · ')}
                        className="card block cursor-grab p-2 transition-shadow hover:shadow-md active:cursor-grabbing"
                      >
                        <p className="truncate text-[13px] font-medium leading-snug text-ink-900">{c.parent_name}</p>
                        {c.student_name && <p className="truncate text-xs text-ink-500">{c.student_name}</p>}
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <span className={`text-[11px] ${overdue ? 'font-medium text-rose-600' : 'text-ink-500'}`}>
                            {c.next_followup_date ? shortDate(c.next_followup_date) : '—'}
                          </span>
                          {c.profiles?.full_name && (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                              {initials(c.profiles.full_name)}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
