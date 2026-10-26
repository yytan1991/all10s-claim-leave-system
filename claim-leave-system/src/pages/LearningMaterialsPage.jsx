import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Video, FileText, StickyNote, BookOpen } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import MaterialView from '../components/MaterialView'
import { Alert, EmptyState } from '../components/UI'
import { formatDate } from '../lib/helpers'

const TYPES = [
  { value: 'video', label: 'Video', icon: Video },
  { value: 'file', label: 'Worksheet / file', icon: FileText },
  { value: 'note', label: 'Note', icon: StickyNote },
]

export default function LearningMaterialsPage() {
  const { profile, isAdmin } = useAuth()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadClasses() {
    setLoading(true)
    const { data: classData } = await supabase
      .from('classes')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .order('name')

    let list = classData || []
    // Admins can manage every class; teachers only the classes they teach.
    if (!isAdmin) {
      const { data: links } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile.id)
      const allowed = new Set((links || []).map((l) => l.class_id))
      list = list.filter((c) => allowed.has(c.id))
    }
    setClasses(list)
    if (list.length > 0) setClassId((prev) => prev || list[0].id)
    setLoading(false)
  }

  useEffect(() => {
    if (classId) loadMaterials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function loadMaterials() {
    setMaterialsLoading(true)
    const { data, error: loadError } = await supabase
      .from('learning_materials')
      .select('*, profiles(full_name)')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    setMaterials(data || [])
    setMaterialsLoading(false)
  }

  async function deleteMaterial(m) {
    if (!confirm(`Delete "${m.title}"? Students will no longer see it.`)) return
    setError('')
    if (m.storage_path) {
      await supabase.storage.from('learning-materials').remove([m.storage_path])
    }
    const { error: deleteError } = await supabase.from('learning_materials').delete().eq('id', m.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadMaterials()
  }

  const typeInfo = (value) => TYPES.find((t) => t.value === value) || TYPES[1]

  return (
    <AppLayout title="Learning Materials" subtitle="Upload videos, worksheets and notes for your classes. Enrolled students see them in their portal.">
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No classes available"
          description={isAdmin ? 'Create a class first, under Student Management.' : "You're not assigned to teach any classes yet."}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 mb-5">
            <div className="w-full sm:w-72">
              <label className="field-label">Class</label>
              <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => setAdding(true)} className="btn-primary text-sm">
              <Plus size={15} /> Add material
            </button>
          </div>

          {error && (
            <div className="mb-4">
              <Alert tone="rose">{error}</Alert>
            </div>
          )}

          {materialsLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : materials.length === 0 ? (
            <EmptyState icon={BookOpen} title="Nothing uploaded for this class yet" description="Add a video, worksheet or note above." />
          ) : (
            <div className="space-y-4">
              {materials.map((m) => {
                const Info = typeInfo(m.material_type)
                return (
                  <div key={m.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="h-9 w-9 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center">
                          <Info.icon size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink-900">{m.title}</p>
                          <p className="text-xs text-ink-500">
                            {Info.label} · {m.profiles?.full_name || 'Unknown'} · {formatDate(m.created_at?.slice(0, 10))}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => deleteMaterial(m)} className="text-rose-500 hover:text-rose-600 shrink-0" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {m.material_type !== 'note' && m.description && (
                      <p className="text-sm text-ink-700 whitespace-pre-wrap mb-3">{m.description}</p>
                    )}
                    <MaterialView material={m} />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {adding && (
        <AddMaterialModal
          orgId={profile.org_id}
          classId={classId}
          createdBy={profile.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            loadMaterials()
          }}
        />
      )}
    </AppLayout>
  )
}

function AddMaterialModal({ orgId, classId, createdBy, onClose, onSaved }) {
  const [type, setType] = useState('video')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoSource, setVideoSource] = useState('link') // 'link' | 'upload'
  const [linkUrl, setLinkUrl] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const needsFile = type === 'file' || (type === 'video' && videoSource === 'upload')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Give it a title.')
      return
    }
    if (type === 'note' && !description.trim()) {
      setError('Write the note.')
      return
    }
    if (type === 'video' && videoSource === 'link' && !/^https?:\/\//i.test(linkUrl.trim())) {
      setError('Paste a full video link starting with http:// or https://')
      return
    }
    if (needsFile && !file) {
      setError('Choose a file to upload.')
      return
    }

    setSaving(true)
    let url = type === 'video' && videoSource === 'link' ? linkUrl.trim() : null
    let storagePath = null
    let fileName = null

    if (needsFile) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      storagePath = `${orgId}/${classId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('learning-materials').upload(storagePath, file)
      if (uploadError) {
        setSaving(false)
        setError(`Upload failed: ${uploadError.message}`)
        return
      }
      url = supabase.storage.from('learning-materials').getPublicUrl(storagePath).data.publicUrl
      fileName = file.name
    }

    const { error: insertError } = await supabase.from('learning_materials').insert({
      org_id: orgId,
      class_id: classId,
      title: title.trim(),
      description: description.trim() || null,
      material_type: type,
      url,
      file_name: fileName,
      storage_path: storagePath,
      created_by: createdBy,
    })
    setSaving(false)
    if (insertError) {
      // Don't leave an orphaned file behind if the record couldn't be saved.
      if (storagePath) await supabase.storage.from('learning-materials').remove([storagePath])
      setError(insertError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">Add learning material</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert tone="rose">{error}</Alert>}

          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs font-medium ${
                  type === t.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-sand-200 text-ink-500 hover:text-ink-900'
                }`}
              >
                <t.icon size={18} />
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className="field-label">Title</label>
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 3 fractions revision" />
          </div>

          {type === 'video' && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm text-ink-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={videoSource === 'link'} onChange={() => setVideoSource('link')} /> Paste a link (YouTube, Google Drive…)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={videoSource === 'upload'} onChange={() => setVideoSource('upload')} /> Upload a file
                </label>
              </div>
              {videoSource === 'link' ? (
                <input className="field-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/*"
                    className="field-input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-ink-500 mt-1">
                    Large videos may be refused for size. If that happens, upload to YouTube (unlisted) or Google Drive and paste the link instead.
                  </p>
                </div>
              )}
            </div>
          )}

          {type === 'file' && (
            <div>
              <label className="field-label">File</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*"
                className="field-input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-ink-500 mt-1">PDF, Word, PowerPoint, Excel, text or a picture.</p>
            </div>
          )}

          <div>
            <label className="field-label">{type === 'note' ? 'Note' : 'Description (optional)'}</label>
            <textarea
              className="field-input min-h-[90px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'note' ? 'Write the note students will read…' : 'Anything students should know before opening it'}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Add material'}
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
