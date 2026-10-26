import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Pencil, ClipboardCheck, ArrowUp, ArrowDown, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { formatDate } from '../lib/helpers'

export default function QuizzesPage() {
  const { profile, isAdmin } = useAuth()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [editing, setEditing] = useState(null) // null | {} (new) | quiz row
  const [resultsFor, setResultsFor] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadClasses() {
    setLoading(true)
    const { data: classData } = await supabase.from('classes').select('id, name').eq('org_id', profile.org_id).order('name')
    let list = classData || []
    // Admins manage every class; teachers only the classes they teach.
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
    if (classId) loadQuizzes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function loadQuizzes() {
    setListLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('quizzes')
      .select('*, quiz_questions(count), quiz_attempts(count)')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    setQuizzes(data || [])
    setListLoading(false)
  }

  async function deleteQuiz(q) {
    if (!confirm(`Delete "${q.title}"? Its questions and all students' results for it will be deleted too.`)) return
    const { error: deleteError } = await supabase.from('quizzes').delete().eq('id', q.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadQuizzes()
  }

  const count = (rel) => (Array.isArray(rel) && rel[0] ? rel[0].count : 0)

  return (
    <AppLayout title="Practice & Quizzes" subtitle="Practices are for students to learn with. Quizzes are marked and their results go to parents.">
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
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
            <button onClick={() => setEditing({})} className="btn-primary text-sm">
              <Plus size={15} /> New practice or quiz
            </button>
          </div>

          {error && (
            <div className="mb-4">
              <Alert tone="rose">{error}</Alert>
            </div>
          )}

          {listLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : quizzes.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Nothing here yet" description="Create a practice or quiz for this class." />
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => (
                <div key={q.id} className="card p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {q.title}{' '}
                      <span className={q.kind === 'quiz' ? 'badge-pending' : 'badge-approved'}>{q.kind === 'quiz' ? 'Quiz' : 'Practice'}</span>
                      {!q.published && <span className="badge-cancelled ml-1">Hidden</span>}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {count(q.quiz_questions)} question{count(q.quiz_questions) === 1 ? '' : 's'} · {count(q.quiz_attempts)} attempt
                      {count(q.quiz_attempts) === 1 ? '' : 's'}
                      {q.kind === 'quiz' ? (q.allow_retake ? ' · retakes allowed' : ' · one attempt each') : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setResultsFor(q)} className="btn-secondary text-xs">
                      <BarChart3 size={13} /> Results
                    </button>
                    <button onClick={() => setEditing(q)} className="text-brand-600 hover:text-brand-700" title="Edit">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteQuiz(q)} className="text-rose-500 hover:text-rose-600" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <QuizEditor
          orgId={profile.org_id}
          classId={classId}
          createdBy={profile.id}
          quiz={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadQuizzes()
          }}
        />
      )}

      {resultsFor && <ResultsModal quiz={resultsFor} onClose={() => setResultsFor(null)} />}
    </AppLayout>
  )
}

const newQuestion = () => ({
  key: crypto.randomUUID(),
  text: '',
  type: 'choice',
  options: ['', '', '', ''],
  correctIndex: 0,
  correctText: '',
  speakText: '',
})

function QuizEditor({ orgId, classId, createdBy, quiz, onClose, onSaved }) {
  const isEdit = Boolean(quiz.id)
  const [title, setTitle] = useState(quiz.title || '')
  const [description, setDescription] = useState(quiz.description || '')
  const [kind, setKind] = useState(quiz.kind || 'practice')
  const [allowRetake, setAllowRetake] = useState(quiz.allow_retake ?? true)
  const [published, setPublished] = useState(quiz.published ?? true)
  const [questions, setQuestions] = useState(isEdit ? [] : [newQuestion()])
  const [oldIds, setOldIds] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', quiz.id)
      .order('position')
      .then(({ data }) => {
        const rows = data || []
        setOldIds(rows.map((r) => r.id))
        setQuestions(
          rows.length
            ? rows.map((r) => {
                const opts = Array.isArray(r.options) ? [...r.options] : []
                while (opts.length < 2) opts.push('')
                const idx = opts.findIndex((o) => o === r.correct_answer)
                return {
                  key: r.id,
                  text: r.question_text,
                  type: r.question_type,
                  options: opts,
                  correctIndex: idx >= 0 ? idx : 0,
                  correctText: r.question_type === 'text' ? r.correct_answer : '',
                  speakText: r.speak_text || '',
                }
              })
            : [newQuestion()]
        )
        setLoadingQuestions(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (key, patch) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  const remove = (key) => setQuestions((qs) => qs.filter((q) => q.key !== key))
  const move = (index, dir) =>
    setQuestions((qs) => {
      const next = [...qs]
      const j = index + dir
      if (j < 0 || j >= next.length) return qs
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  const setOption = (key, i, value) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, options: q.options.map((o, oi) => (oi === i ? value : o)) } : q)))

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Give it a title.')
      return
    }
    if (questions.length === 0) {
      setError('Add at least one question.')
      return
    }

    const rows = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const n = i + 1
      if (!q.text.trim()) {
        setError(`Question ${n} needs some text.`)
        return
      }
      if (q.type === 'choice') {
        const opts = q.options.map((o) => o.trim())
        const filled = opts.filter(Boolean)
        const correct = opts[q.correctIndex]
        if (filled.length < 2) {
          setError(`Question ${n} needs at least two choices.`)
          return
        }
        if (!correct) {
          setError(`Question ${n}: pick which choice is correct (and make sure it isn't empty).`)
          return
        }
        rows.push({
          position: i,
          question_text: q.text.trim(),
          question_type: 'choice',
          options: filled,
          correct_answer: correct,
          speak_text: q.speakText.trim() || null,
        })
      } else {
        if (!q.correctText.trim()) {
          setError(`Question ${n} needs the correct answer.`)
          return
        }
        rows.push({
          position: i,
          question_text: q.text.trim(),
          question_type: 'text',
          options: null,
          correct_answer: q.correctText.trim(),
          speak_text: q.speakText.trim() || null,
        })
      }
    }

    setSaving(true)
    const quizFields = {
      title: title.trim(),
      description: description.trim() || null,
      kind,
      allow_retake: kind === 'quiz' ? allowRetake : true,
      published,
    }

    let quizId = quiz.id
    if (isEdit) {
      const { error: updateError } = await supabase.from('quizzes').update(quizFields).eq('id', quizId)
      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }
    } else {
      const { data: created, error: insertError } = await supabase
        .from('quizzes')
        .insert({ ...quizFields, org_id: orgId, class_id: classId, created_by: createdBy })
        .select()
        .single()
      if (insertError) {
        setSaving(false)
        setError(insertError.message)
        return
      }
      quizId = created.id
    }

    // Add the new questions first, then remove the old ones, so a failure never leaves the quiz empty.
    const { error: questionsError } = await supabase.from('quiz_questions').insert(rows.map((r) => ({ ...r, quiz_id: quizId })))
    if (questionsError) {
      setSaving(false)
      setError(questionsError.message)
      return
    }
    if (oldIds.length > 0) {
      await supabase.from('quiz_questions').delete().in('id', oldIds)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink-900">{isEdit ? 'Edit' : 'New'} practice or quiz</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        {loadingQuestions ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {error && <Alert tone="rose">{error}</Alert>}

            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'practice', label: 'Practice', note: 'Unlimited tries. Students see the right answers. Not shown to parents.' },
                { value: 'quiz', label: 'Quiz', note: 'Marked and recorded. Results go to parents. Answers are not shown.' },
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setKind(o.value)}
                  className={`text-left rounded-md border px-3 py-3 ${kind === o.value ? 'border-brand-600 bg-brand-50' : 'border-sand-200 hover:bg-sand-50'}`}
                >
                  <p className="text-sm font-medium text-ink-900">{o.label}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{o.note}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="field-label">Title</label>
              <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 spelling" />
            </div>
            <div>
              <label className="field-label">Instructions (optional)</label>
              <input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="flex flex-wrap gap-5 text-sm text-ink-700">
              {kind === 'quiz' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowRetake} onChange={(e) => setAllowRetake(e.target.checked)} /> Students can retake it
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Visible to students
              </label>
            </div>

            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.key} className="rounded-md border border-sand-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-900">Question {i + 1}</p>
                    <div className="flex items-center gap-2 text-ink-500">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-ink-900 disabled:opacity-30">
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="hover:text-ink-900 disabled:opacity-30">
                        <ArrowDown size={15} />
                      </button>
                      <button type="button" onClick={() => remove(q.key)} className="text-rose-500 hover:text-rose-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <input className="field-input" value={q.text} onChange={(e) => update(q.key, { text: e.target.value })} placeholder="The question" />

                  <select className="field-input" value={q.type} onChange={(e) => update(q.key, { type: e.target.value })}>
                    <option value="choice">Multiple choice</option>
                    <option value="text">Type the answer</option>
                  </select>

                  {q.type === 'choice' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-ink-500">Fill in the choices, and tick the correct one.</p>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input type="radio" name={`correct-${q.key}`} checked={q.correctIndex === oi} onChange={() => update(q.key, { correctIndex: oi })} />
                          <input className="field-input" value={opt} onChange={(e) => setOption(q.key, oi, e.target.value)} placeholder={`Choice ${oi + 1}`} />
                        </div>
                      ))}
                      {q.options.length < 6 && (
                        <button type="button" onClick={() => update(q.key, { options: [...q.options, ''] })} className="text-xs text-brand-600 hover:underline">
                          + Add a choice
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        className="field-input"
                        value={q.correctText}
                        onChange={(e) => update(q.key, { correctText: e.target.value })}
                        placeholder="The correct answer"
                      />
                      <p className="text-xs text-ink-500 mt-1">
                        Capital letters and extra spaces don't matter. For more than one accepted answer, separate them with | (for example colour|color).
                      </p>
                    </div>
                  )}

                  <div>
                    <input
                      className="field-input"
                      value={q.speakText}
                      onChange={(e) => update(q.key, { speakText: e.target.value })}
                      placeholder="Read aloud (optional) — e.g. the spelling word"
                    />
                    <p className="text-xs text-ink-500 mt-1">If filled in, students get a Listen button and the device reads this out. Handy for spelling.</p>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setQuestions((qs) => [...qs, newQuestion()])} className="btn-secondary text-sm">
              <Plus size={14} /> Add question
            </button>

            <div className="flex gap-3 pt-2 border-t border-sand-100">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ResultsModal({ quiz, onClose }) {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('quiz_attempts')
      .select('*, students(full_name)')
      .eq('quiz_id', quiz.id)
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    setAttempts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resetAttempt(a) {
    if (!confirm(`Delete ${a.students?.full_name || 'this student'}'s attempt? They will be able to do it again.`)) return
    const { error: deleteError } = await supabase.from('quiz_attempts').delete().eq('id', a.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  const avg = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / attempts.length)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="card w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-ink-900">{quiz.title}</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-500 mb-4">
          {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
          {avg !== null ? ` · average ${avg}%` : ''}
        </p>
        {error && (
          <div className="mb-3">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody has done this yet.</p>
        ) : (
          <div className="divide-y divide-sand-100">
            {attempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-ink-900 truncate">{a.students?.full_name || 'Student'}</p>
                  <p className="text-xs text-ink-500">{formatDate(a.created_at.slice(0, 10))}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-ink-900">
                    {a.score}/{a.total}
                  </span>
                  <button onClick={() => resetAttempt(a)} className="text-rose-500 hover:text-rose-600" title="Delete this attempt">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
