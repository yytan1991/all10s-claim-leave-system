import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { formatDate, initials, isOverdue } from '../lib/helpers'

export default function CrmPipelineBoard() {
  const { profile } = useAuth()
  const [stages, setStages] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOverStage, setDragOverStage] = useState(null)

  useEffect(() => {
    if (profile) load()
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
      <AppLayout title="Pipeline board" subtitle="Drag leads between stages.">
        <p className="text-sm text-ink-500">Loading…</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Pipeline board" subtitle="Drag a lead's card to move it between stages.">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageContacts = contacts.filter((c) => c.stage_id === stage.id)
          const isOver = dragOverStage === stage.id
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverStage(stage.id)
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`flex-shrink-0 w-72 rounded-card border ${
                isOver ? 'border-brand-500 bg-brand-50/40' : 'border-sand-200 bg-sand-100/60'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-sand-200">
                <p className="text-sm font-semibold text-ink-900">{stage.name}</p>
                <span className="text-xs text-ink-500 bg-white rounded-full px-2 py-0.5">
                  {stageContacts.length}
                </span>
              </div>

              <div className="p-2 space-y-2 min-h-[120px]">
                {stageContacts.map((c) => {
                  const overdue = isOverdue(c.next_followup_date) && !stage.is_won && !stage.is_lost
                  return (
                    <Link
                      key={c.id}
                      to={`/crm/leads/${c.id}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                      className="block card p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
                    >
                      <p className="text-sm font-medium text-ink-900 truncate">{c.parent_name}</p>
                      {c.student_name && (
                        <p className="text-xs text-ink-500 truncate">{c.student_name}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs ${overdue ? 'text-rose-600 font-medium' : 'text-ink-500'}`}>
                          {c.next_followup_date ? formatDate(c.next_followup_date) : '—'}
                        </span>
                        {c.profiles?.full_name && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold">
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

        <Link
          to="/crm/leads/new"
          className="flex-shrink-0 w-16 flex items-center justify-center rounded-card border-2 border-dashed border-sand-200 text-ink-500 hover:border-brand-500 hover:text-brand-600 transition-colors"
        >
          <Plus size={20} />
        </Link>
      </div>
    </AppLayout>
  )
}
