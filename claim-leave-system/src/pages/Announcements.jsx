import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Image as ImageIcon, Video, X, Megaphone, Pin, PinOff, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import RichTextEditor from '../components/RichTextEditor'
import { formatDate, initials } from '../lib/helpers'

const AUDIENCE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'students', label: 'Students (coming soon)' },
]

export default function Announcements() {
  const { profile, isManager } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [authors, setAuthors] = useState({})
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function load() {
    setLoading(true)
    // Only "staff" is a real audience today — students/parents will filter
    // in automatically once that portal exists, using the same field.
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('org_id', profile.org_id)
      .contains('target_groups', ['staff'])
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setAnnouncements(data || [])

    const authorIds = [...new Set((data || []).map((a) => a.created_by).filter(Boolean))]
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', authorIds)
      const map = {}
      ;(profiles || []).forEach((p) => (map[p.id] = p.full_name))
      setAuthors(map)
    }
    setLoading(false)
  }

  async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return
    await supabase.from('announcements').delete().eq('id', id)
    load()
  }

  async function togglePin(a) {
    await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id)
    load()
  }

  return (
    <AppLayout title="Announcements" subtitle="Updates and notices for the whole team.">
      {isManager && (
        <div className="mb-6">
          {!composing ? (
            <button onClick={() => setComposing(true)} className="btn-primary">
              <Plus size={16} /> New announcement
            </button>
          ) : (
            <ComposeForm
              orgId={profile.org_id}
              authorId={profile.id}
              onClose={() => setComposing(false)}
              onPosted={() => {
                setComposing(false)
                load()
              }}
            />
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description={isManager ? 'Post your first announcement above.' : "Nothing's been posted yet."}
        />
      ) : (
        <div className="card overflow-hidden divide-y divide-sand-100">
          {announcements.map((a) => {
            const isExpanded = expandedId === a.id
            return (
              <div key={a.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-sand-50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={15} className="text-ink-500 shrink-0" />
                  ) : (
                    <ChevronRight size={15} className="text-ink-500 shrink-0" />
                  )}
                  {a.pinned && <Pin size={13} className="text-amber-500 shrink-0" fill="currentColor" />}
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-ink-900 truncate block">{a.title}</span>
                  </span>
                  <span className="text-xs text-ink-500 shrink-0 hidden sm:inline">
                    {authors[a.created_by] || 'Unknown'} · {formatDate(a.created_at?.slice(0, 10))}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-1">
                    <div className="flex items-center justify-between mb-3 sm:hidden">
                      <p className="text-xs text-ink-500">
                        {authors[a.created_by] || 'Unknown'} · {formatDate(a.created_at?.slice(0, 10))}
                      </p>
                    </div>

                    {isManager && (
                      <div className="flex gap-3 mb-4">
                        <button onClick={() => togglePin(a)} className="btn-secondary text-xs">
                          {a.pinned ? (
                            <>
                              <PinOff size={13} /> Unpin
                            </>
                          ) : (
                            <>
                              <Pin size={13} /> Pin to top
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => deleteAnnouncement(a.id)}
                          className="text-rose-500 hover:text-rose-600 text-xs inline-flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    )}

                    <div
                      className="prose-sm max-w-none text-ink-700 text-sm [&_a]:text-brand-600 [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: a.body_html }}
                    />

                    {a.media?.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {a.media.map((m, i) =>
                          m.type === 'video' ? (
                            <video key={i} src={m.url} controls className="rounded-md w-full aspect-video bg-black" />
                          ) : (
                            <a key={i} href={m.url} target="_blank" rel="noreferrer">
                              <img src={m.url} alt={m.name || ''} className="rounded-md w-full aspect-video object-cover" />
                            </a>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}

function ComposeForm({ orgId, authorId, onClose, onPosted }) {
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [media, setMedia] = useState([])
  const [audience, setAudience] = useState(['staff'])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)

  function toggleAudience(value) {
    setAudience((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleFileSelect(e, type) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)

    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('announcement-media').upload(path, file)
    setUploading(false)
    if (uploadError) {
      setError(uploadError.message)
      return
    }
    const { data: urlData } = supabase.storage.from('announcement-media').getPublicUrl(path)
    setMedia((prev) => [...prev, { type, url: urlData.publicUrl, name: file.name }])
    e.target.value = ''
  }

  function removeMedia(index) {
    setMedia((prev) => prev.filter((_, i) => i !== index))
  }

  async function handlePost(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Give the announcement a title.')
      return
    }
    if (audience.length === 0) {
      setError('Pick at least one audience to send this to.')
      return
    }
    setPosting(true)
    const { error: insertError } = await supabase.from('announcements').insert({
      org_id: orgId,
      title: title.trim(),
      body_html: bodyHtml,
      media,
      target_groups: audience,
      created_by: authorId,
    })
    setPosting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onPosted()
  }

  return (
    <form onSubmit={handlePost} className="card p-5 space-y-4">
      {error && <Alert tone="rose">{error}</Alert>}

      <div>
        <label className="field-label">Title</label>
        <input
          className="field-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Centre closed for Hari Raya"
        />
      </div>

      <div>
        <label className="field-label mb-2 block">Send to</label>
        <div className="flex gap-4">
          {AUDIENCE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={audience.includes(o.value)}
                onChange={() => toggleAudience(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="field-label">Message</label>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Write your announcement…" />
      </div>

      <div>
        <label className="field-label mb-2 block">Attachments</label>
        <div className="flex gap-2 mb-3">
          <input
            type="file"
            accept="image/*"
            ref={imageInputRef}
            onChange={(e) => handleFileSelect(e, 'image')}
            className="hidden"
          />
          <input
            type="file"
            accept="video/*"
            ref={videoInputRef}
            onChange={(e) => handleFileSelect(e, 'video')}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm"
          >
            <ImageIcon size={14} /> Add photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm"
          >
            <Video size={14} /> Add video
          </button>
          {uploading && <span className="text-xs text-ink-500 self-center">Uploading…</span>}
        </div>

        {media.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {media.map((m, i) => (
              <div key={i} className="relative group">
                {m.type === 'video' ? (
                  <video src={m.url} className="rounded-md w-full aspect-video object-cover bg-black" />
                ) : (
                  <img src={m.url} alt={m.name} className="rounded-md w-full aspect-video object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute -top-1.5 -right-1.5 bg-ink-900 text-white rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={posting || uploading} className="btn-primary">
          {posting ? 'Posting…' : 'Post announcement'}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}