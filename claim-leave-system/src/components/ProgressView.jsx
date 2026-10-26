import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/helpers'

// Scores over time for one class, drawn as a simple line chart (0–100%).
function ScoreChart({ points }) {
  const w = 340
  const h = 130
  const padX = 28
  const padY = 16
  const n = points.length
  const x = (i) => (n === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (n - 1))
  const y = (pct) => h - padY - (pct / 100) * (h - padY * 2)
  const line = points.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-md">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={padX} x2={w - padX} y1={y(g)} y2={y(g)} stroke="#eee6e0" strokeWidth="1" />
          <text x={padX - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#9a8f87">
            {g}%
          </text>
        </g>
      ))}
      {n > 1 && <polyline points={line} fill="none" stroke="#CD5B15" strokeWidth="2" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.pct)} r="4" fill="#CD5B15">
          <title>{`${p.title} — ${p.score}/${p.total} (${p.pct}%) on ${formatDate(p.date)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

// What a parent sees about their child: quiz results (never practices), attendance next to
// the scores, and short comments from teachers. Staff use the same view and can add comments.
//   studentId       – whose progress
//   orgId, authorId, authorName, defaultClassId – only needed when staff may add comments
export default function ProgressView({ studentId, orgId, authorId, authorName, defaultClassId }) {
  const canComment = Boolean(authorId && orgId)
  const [attempts, setAttempts] = useState([])
  const [attendance, setAttendance] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (studentId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  async function load() {
    setLoading(true)
    setError('')
    const [{ data: att, error: attError }, { data: attend }, { data: comm }] = await Promise.all([
      supabase
        .from('quiz_attempts')
        .select('id, score, total, created_at, quizzes(title, kind, class_id, classes(name))')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true }),
      supabase.from('student_attendance').select('status, class_id, classes(name)').eq('student_id', studentId),
      supabase
        .from('progress_comments')
        .select('*, classes(name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
    ])
    if (attError) setError(attError.message)
    // Practices are for the student only — keep just real quizzes, even if staff can read both.
    setAttempts((att || []).filter((a) => a.quizzes?.kind === 'quiz'))
    setAttendance(attend || [])
    setComments(comm || [])
    setLoading(false)
  }

  async function addComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('progress_comments').insert({
      org_id: orgId,
      student_id: studentId,
      class_id: defaultClassId || null,
      comment: newComment.trim(),
      author_name: authorName || null,
      created_by: authorId,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewComment('')
    load()
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('progress_comments').delete().eq('id', id)
    load()
  }

  if (loading) return <p className="text-sm text-ink-500">Loading…</p>

  // Group quiz scores and attendance by class
  const byClass = {}
  const ensure = (id, name) => {
    if (!byClass[id]) byClass[id] = { name: name || 'Class', points: [], present: 0, late: 0, absent: 0 }
    return byClass[id]
  }
  attempts.forEach((a) => {
    const c = ensure(a.quizzes.class_id, a.quizzes.classes?.name)
    c.points.push({
      title: a.quizzes.title,
      score: a.score,
      total: a.total,
      pct: a.total > 0 ? Math.round((a.score / a.total) * 100) : 0,
      date: a.created_at.slice(0, 10),
    })
  })
  attendance.forEach((a) => {
    const c = ensure(a.class_id, a.classes?.name)
    if (a.status === 'present') c.present += 1
    else if (a.status === 'late') c.late += 1
    else if (a.status === 'absent') c.absent += 1
  })
  const classRows = Object.entries(byClass)
    .map(([id, c]) => {
      const marked = c.present + c.late + c.absent
      const avg = c.points.length ? Math.round(c.points.reduce((s, p) => s + p.pct, 0) / c.points.length) : null
      return { id, ...c, marked, attended: c.present + c.late, avg, latest: c.points[c.points.length - 1] }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const recent = [...attempts].reverse().slice(0, 10)

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</p>}

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-sand-100">
          <h4 className="font-medium text-ink-900">Attendance and quiz scores</h4>
        </div>
        {classRows.length === 0 ? (
          <p className="text-sm text-ink-500 p-5">No attendance or quiz results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Attendance</th>
                  <th className="px-5 py-3 font-medium">Quiz average</th>
                  <th className="px-5 py-3 font-medium">Latest quiz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {classRows.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{c.name}</td>
                    <td className="px-5 py-3 text-ink-700">
                      {c.marked > 0 ? `${c.attended} of ${c.marked} classes (${Math.round((c.attended / c.marked) * 100)}%)` : '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-700">{c.avg !== null ? `${c.avg}%` : '—'}</td>
                    <td className="px-5 py-3 text-ink-700">{c.latest ? `${c.latest.score}/${c.latest.total}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {classRows
        .filter((c) => c.points.length > 0)
        .map((c) => (
          <div key={c.id} className="card p-5">
            <h4 className="font-medium text-ink-900 mb-1">{c.name} — scores over time</h4>
            <p className="text-xs text-ink-500 mb-2">Each dot is one quiz. Hover or tap a dot to see which.</p>
            <ScoreChart points={c.points} />
          </div>
        ))}

      {recent.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-sand-100">
            <h4 className="font-medium text-ink-900">Recent quiz results</h4>
          </div>
          <div className="divide-y divide-sand-100">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink-900 truncate">{a.quizzes.title}</p>
                  <p className="text-xs text-ink-500">
                    {a.quizzes.classes?.name} · {formatDate(a.created_at.slice(0, 10))}
                  </p>
                </div>
                <span className="font-medium text-ink-900 shrink-0">
                  {a.score}/{a.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h4 className="font-medium text-ink-900 mb-3">Teacher comments</h4>
        {canComment && (
          <form onSubmit={addComment} className="mb-4">
            <textarea
              className="field-input min-h-[70px]"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a short comment parents will read, e.g. how this student is getting on"
            />
            <button type="submit" disabled={saving || !newComment.trim()} className="btn-primary text-sm mt-2">
              {saving ? 'Saving…' : 'Add comment'}
            </button>
          </form>
        )}
        {comments.length === 0 ? (
          <p className="text-sm text-ink-500">No comments yet.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-md bg-sand-50 px-4 py-3">
                <p className="text-sm text-ink-800 whitespace-pre-wrap">{c.comment}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-ink-500">
                    {c.author_name || 'Teacher'}
                    {c.classes?.name ? ` · ${c.classes.name}` : ''} · {formatDate(c.created_at.slice(0, 10))}
                  </p>
                  {canComment && (
                    <button onClick={() => deleteComment(c.id)} className="text-rose-500 hover:text-rose-600" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
