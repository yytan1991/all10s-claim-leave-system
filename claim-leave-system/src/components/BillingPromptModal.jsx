import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Receipt } from 'lucide-react'

// Shown right after students are enrolled in lessons that have a fee but no recurring invoice yet,
// so the invoice isn't forgotten. "Go to Recurring Invoice" opens the new-plan form already filled in
// for the student (one student after another, if several were enrolled).
//   items:  [{ studentId, studentName, lessonId, lessonName, fee }]
//   onDone: called when the notice closes, whichever button was used
export default function BillingPromptModal({ items, onDone }) {
  const navigate = useNavigate()

  // one entry per student, with the lessons they were just enrolled in
  const groups = []
  items.forEach((it) => {
    let g = groups.find((x) => x.studentId === it.studentId)
    if (!g) {
      g = { studentId: it.studentId, studentName: it.studentName, lessons: [] }
      groups.push(g)
    }
    g.lessons.push({ lessonId: it.lessonId, lessonName: it.lessonName, fee: it.fee })
  })

  function goToRecurringInvoice() {
    const q = groups.map((g) => `${g.studentId}~${g.lessons.map((l) => l.lessonId).join(',')}`).join(';')
    onDone()
    navigate(`/recurring-invoice?new=1&q=${encodeURIComponent(q)}`)
  }

  const single = groups.length === 1

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <span className="h-10 w-10 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center">
            <Receipt size={18} />
          </span>
          <div>
            <h3 className="font-semibold text-ink-900">Add a recurring invoice?</h3>
            <p className="text-sm text-ink-500 mt-0.5">
              {single
                ? `${groups[0].studentName} was just enrolled in ${groups[0].lessons.length === 1 ? 'a lesson' : 'lessons'} with a fee, but has no recurring invoice for ${groups[0].lessons.length === 1 ? 'it' : 'them'} yet.`
                : `${groups.length} students were just enrolled in lessons with a fee, but have no recurring invoice for them yet.`}
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {groups.map((g) => (
            <div key={g.studentId} className="rounded-md border border-sand-200 px-4 py-2.5">
              {!single && <p className="text-sm font-medium text-ink-900">{g.studentName}</p>}
              {g.lessons.map((l) => (
                <p key={l.lessonId} className="text-sm text-ink-700">
                  {l.lessonName} <span className="text-ink-500">· RM {Number(l.fee).toFixed(2)}</span>
                </p>
              ))}
            </div>
          ))}
        </div>

        <p className="text-xs text-ink-500 mb-4">
          {single ? 'You can set the billing period and amount on the next page.' : "You'll go through them one at a time and can skip any."} You can also add it
          later under Recurring Invoice.
        </p>

        <div className="flex gap-3">
          <button onClick={goToRecurringInvoice} className="btn-primary">
            Go to Recurring Invoice
          </button>
          <button onClick={onDone} className="btn-secondary">
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
