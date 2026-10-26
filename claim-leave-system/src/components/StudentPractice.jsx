import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X, Volume2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Reads text out loud with the device's own voice (works for English and Chinese).
function speak(text) {
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-GB'
    u.rate = 0.85
    window.speechSynthesis.speak(u)
  } catch (err) {
    // no speech support on this device — the question text still shows
  }
}

export default function StudentPractice() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.rpc('student_quiz_list')
    if (loadError) setError(loadError.message)
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (activeId) {
    return (
      <QuizTaker
        quizId={activeId}
        onExit={() => {
          setActiveId(null)
          load()
        }}
      />
    )
  }

  if (loading) return <p className="text-sm text-ink-500">Loading…</p>
  if (error) return <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</p>
  if (items.length === 0) {
    return <p className="text-sm text-ink-500">Your teachers haven't added any practices or quizzes yet.</p>
  }

  const byClass = {}
  items.forEach((q) => {
    if (!byClass[q.class_name]) byClass[q.class_name] = []
    byClass[q.class_name].push(q)
  })

  return (
    <div className="space-y-6">
      {Object.entries(byClass).map(([className, list]) => (
        <div key={className}>
          <h4 className="text-sm font-semibold text-ink-900 mb-2">{className}</h4>
          <div className="space-y-3">
            {list.map((q) => {
              const done = q.kind === 'quiz' && !q.allow_retake && q.attempts > 0
              return (
                <div key={q.id} className="card p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {q.title}{' '}
                      <span className={q.kind === 'quiz' ? 'badge-pending' : 'badge-approved'}>
                        {q.kind === 'quiz' ? 'Quiz' : 'Practice'}
                      </span>
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {q.question_count} question{q.question_count === 1 ? '' : 's'}
                      {q.attempts > 0 && q.best_score !== null ? ` · Best: ${q.best_score}/${q.best_total}` : ''}
                    </p>
                    {q.description && <p className="text-sm text-ink-700 mt-1">{q.description}</p>}
                  </div>
                  {done ? (
                    <span className="text-xs text-ink-500 shrink-0">Completed</span>
                  ) : (
                    <button
                      onClick={() => setActiveId(q.id)}
                      disabled={q.question_count === 0}
                      className="btn-primary text-sm shrink-0"
                    >
                      {q.attempts > 0 ? 'Try again' : 'Start'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuizTaker({ quizId, onExit }) {
  const [quiz, setQuiz] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [answers, setAnswers] = useState({})
  const [index, setIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null)

  async function loadQuiz() {
    setQuiz(null)
    setLoadError('')
    setAnswers({})
    setIndex(0)
    setResult(null)
    const { data, error } = await supabase.rpc('student_get_quiz', { p_quiz_id: quizId })
    if (error) setLoadError(error.message)
    else setQuiz(data)
  }

  useEffect(() => {
    loadQuiz()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId])

  async function submit() {
    setSubmitting(true)
    setSubmitError('')
    const { data, error } = await supabase.rpc('student_submit_quiz', { p_quiz_id: quizId, p_answers: answers })
    setSubmitting(false)
    if (error) {
      setSubmitError(error.message)
      return
    }
    setResult(data)
  }

  if (loadError) {
    return (
      <div>
        <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2 mb-3">{loadError}</p>
        <button onClick={onExit} className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    )
  }
  if (!quiz) return <p className="text-sm text-ink-500">Loading…</p>

  if (result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0
    return (
      <div>
        <div className="card p-6 text-center mb-4">
          <p className="text-sm text-ink-500">{quiz.title}</p>
          <p className="text-4xl font-semibold text-ink-900 my-2">
            {result.score} / {result.total}
          </p>
          <p className="text-sm text-ink-700">
            {pct === 100 ? 'Perfect! Well done!' : pct >= 70 ? 'Great job!' : pct >= 40 ? 'Good try — keep practising!' : "Don't give up — try again!"}
          </p>
        </div>

        <div className="space-y-2 mb-5">
          {result.review.map((r, i) => (
            <div key={r.question_id} className="card p-3 flex gap-3">
              <span
                className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-white ${r.correct ? 'bg-emerald-500' : 'bg-rose-500'}`}
              >
                {r.correct ? <Check size={14} /> : <X size={14} />}
              </span>
              <div className="min-w-0 text-sm">
                <p className="text-ink-900">
                  {i + 1}. {r.text}
                </p>
                <p className="text-ink-500">Your answer: {r.your_answer || '(blank)'}</p>
                {!r.correct && r.correct_answer && <p className="text-emerald-700">Correct answer: {r.correct_answer}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {result.kind === 'practice' && (
            <button onClick={loadQuiz} className="btn-primary text-sm">
              Try again
            </button>
          )}
          <button onClick={onExit} className="btn-secondary text-sm">
            <ArrowLeft size={14} /> Back to the list
          </button>
        </div>
      </div>
    )
  }

  const questions = quiz.questions || []
  const q = questions[index]
  const isLast = index === questions.length - 1
  if (!q) {
    return (
      <div>
        <p className="text-sm text-ink-500 mb-3">This one has no questions yet.</p>
        <button onClick={onExit} className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onExit} className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Leave
        </button>
        <p className="text-sm text-ink-500">
          {quiz.title} · {index + 1} of {questions.length}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-sand-200 mb-5">
        <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="card p-5">
        <p className="text-lg text-ink-900 mb-4">{q.text}</p>

        {q.speak_text && (
          <button type="button" onClick={() => speak(q.speak_text)} className="btn-secondary text-sm mb-4">
            <Volume2 size={15} /> Listen
          </button>
        )}

        {q.type === 'choice' ? (
          <div className="space-y-2">
            {(q.options || []).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer text-sm ${
                  answers[q.id] === opt ? 'border-brand-600 bg-brand-50' : 'border-sand-200 hover:bg-sand-50'
                }`}
              >
                <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === opt} onChange={() => setAnswers({ ...answers, [q.id]: opt })} />
                {opt}
              </label>
            ))}
          </div>
        ) : (
          <input
            className="field-input text-lg"
            value={answers[q.id] || ''}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            placeholder="Type your answer"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </div>

      {submitError && <p className="text-sm text-rose-700 bg-rose-50 rounded-md px-3 py-2 mt-3">{submitError}</p>}

      <div className="flex justify-between mt-4">
        <button onClick={() => setIndex(index - 1)} disabled={index === 0} className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back
        </button>
        {isLast ? (
          <button onClick={submit} disabled={submitting} className="btn-primary text-sm">
            {submitting ? 'Marking…' : 'Finish'}
          </button>
        ) : (
          <button onClick={() => setIndex(index + 1)} className="btn-primary text-sm">
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
