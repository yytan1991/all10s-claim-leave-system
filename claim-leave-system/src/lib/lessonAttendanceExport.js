import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import { toISODate } from './helpers'

const ORDINALS = ['1st', '2nd', '3rd']
const STATUS_LETTER = { present: 'P', late: 'L', absent: 'A' }
const STATUS_WORD = { present: 'Present', late: 'Late', absent: 'Absent' }

const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
const attended = (status) => status === 'present' || status === 'late'

function fmtShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtLongDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
  return `${date}, ${time}`
}

// Builds the rows of the spreadsheet tabs for one lesson. Pure: no database, no files.
//   lesson:   the lessons row            enrolled: [{ id, full_name }]
//   marks:    student_attendance rows inside the date range (with students(full_name), profiles(full_name))
//   ledger:   ALL of the lesson's credit history rows (only for lessons that use credits)
export function buildLessonSheets({ lesson, enrolled, marks, ledger = [], from, to }) {
  const usesCredits = Boolean(lesson.uses_credits)
  const multi = (lesson.attendance_marks_per_day || 1) > 1 || marks.some((m) => (m.session_no || 1) > 1)
  const sessionOf = (m) => m.session_no || 1

  // Everyone enrolled now, plus anyone who has marks in this period but has since left.
  const people = new Map()
  enrolled.forEach((s) => people.set(s.id, { id: s.id, name: s.full_name, enrolled: true }))
  marks.forEach((m) => {
    if (!people.has(m.student_id)) people.set(m.student_id, { id: m.student_id, name: m.students?.full_name || 'Student', enrolled: false })
  })
  const students = [...people.values()].sort(byName)

  // One column per date (and per session, when a lesson has several attendances a day).
  const columnKeys = [...new Set(marks.map((m) => `${m.attendance_date}|${sessionOf(m)}`))].sort()
  const columnLabel = (key) => {
    const [date, session] = key.split('|')
    return multi ? `${fmtShortDate(date)} (${ORDINALS[Number(session) - 1] || session})` : fmtShortDate(date)
  }
  const statusAt = {}
  marks.forEach((m) => {
    statusAt[`${m.student_id}|${m.attendance_date}|${sessionOf(m)}`] = m.status
  })

  // ----- credits (only for lessons that use them) -----
  const ledgerRows = usesCredits ? [...ledger].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || String(a.created_at || '').localeCompare(String(b.created_at || ''))) : []
  const balanceNow = {}
  const usedInRange = {}
  const running = {}
  const creditEntries = []
  ledgerRows.forEach((l) => {
    balanceNow[l.student_id] = (balanceNow[l.student_id] || 0) + l.delta
    running[l.student_id] = (running[l.student_id] || 0) + l.delta
    const day = toISODate(new Date(l.occurred_at))
    if (day >= from && day <= to) {
      if (l.kind === 'attendance' || l.kind === 'attendance_undo') usedInRange[l.student_id] = (usedInRange[l.student_id] || 0) - l.delta
      creditEntries.push({ ...l, balanceAfter: running[l.student_id] })
    }
  })

  // ----- tab 1: the attendance grid -----
  const header = ['Student', ...columnKeys.map(columnLabel), 'Present', 'Late', 'Absent', 'Attended', 'Attendance %']
  if (usesCredits) header.push('Credits used (this period)', 'Credits left (now)')
  const grid = [[`${lesson.name} — attendance`], [`${fmtLongDate(from)} to ${fmtLongDate(to)}`], [], header]
  students.forEach((s) => {
    const cells = columnKeys.map((key) => {
      const [date, session] = key.split('|')
      return STATUS_LETTER[statusAt[`${s.id}|${date}|${session}`]] || ''
    })
    const own = marks.filter((m) => m.student_id === s.id)
    const present = own.filter((m) => m.status === 'present').length
    const late = own.filter((m) => m.status === 'late').length
    const absent = own.filter((m) => m.status === 'absent').length
    const marked = present + late + absent
    const row = [s.enrolled ? s.name : `${s.name} (no longer enrolled)`, ...cells, present, late, absent, present + late, marked ? Math.round(((present + late) / marked) * 100) : '']
    if (usesCredits) row.push(usedInRange[s.id] || 0, balanceNow[s.id] || 0)
    grid.push(row)
  })
  const footer = ['Total attended', ...columnKeys.map((key) => {
    const [date, session] = key.split('|')
    return students.filter((s) => attended(statusAt[`${s.id}|${date}|${session}`])).length
  })]
  grid.push([], footer, [], ['P = Present, L = Late, A = Absent, blank = not marked'])

  // ----- tab 2: every mark, one row each -----
  const recordHeader = ['Date', 'Session', 'Student', 'Status', 'Marked by', 'Marked at']
  if (usesCredits) recordHeader.push('Credit used')
  const sortedMarks = [...marks].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date) || sessionOf(a) - sessionOf(b) || (people.get(a.student_id)?.name || '').localeCompare(people.get(b.student_id)?.name || ''))
  const records = [recordHeader]
  sortedMarks.forEach((m) => {
    const row = [fmtLongDate(m.attendance_date), multi ? ORDINALS[sessionOf(m) - 1] || String(sessionOf(m)) : '', people.get(m.student_id)?.name || 'Student', STATUS_WORD[m.status] || m.status, m.profiles?.full_name || '', fmtDateTime(m.marked_at)]
    if (usesCredits) row.push(attended(m.status) ? 1 : '')
    records.push(row)
  })

  // ----- tab 3: the credit history -----
  let credits = null
  if (usesCredits) {
    credits = [['Date and time', 'Student', 'What happened', 'Credits', 'Left after', 'By', 'Note']]
    creditEntries.forEach((e) => {
      const who = people.get(e.student_id)?.name || e.students?.full_name || 'Student'
      let what
      if (e.kind === 'attendance') what = `Attended class${e.attendance_date ? ` on ${fmtLongDate(e.attendance_date)}` : ''}${multi && e.session_no ? ` (${ORDINALS[e.session_no - 1]} attendance)` : ''}`
      else if (e.kind === 'attendance_undo') what = 'Credit returned (attendance corrected)'
      else if (e.kind === 'manual_add') what = 'Credits added'
      else what = 'Credits deducted'
      credits.push([fmtDateTime(e.occurred_at), who, what, e.delta, e.balanceAfter, e.profiles?.full_name || '', e.kind.startsWith('manual') ? e.note || '' : ''])
    })
  }

  return { grid, records, credits, markCount: marks.length }
}

// The database returns at most 1,000 rows per request, so read the lot in pages.
async function fetchAll(makeQuery) {
  const pageSize = 1000
  const out = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return out
}

async function fetchLessonData(lesson, from, to, orgId) {
  const enrolmentQuery = supabase.from('class_enrollments').select('students(id, full_name)').eq('class_id', lesson.id).eq('org_id', orgId)
  const [{ data: enrolments }, marks, ledger] = await Promise.all([
    enrolmentQuery,
    fetchAll(() =>
      supabase
        .from('student_attendance')
        .select('*, students(full_name), profiles(full_name)')
        .eq('class_id', lesson.id)
        .gte('attendance_date', from)
        .lte('attendance_date', to)
        .order('attendance_date')
        .order('id')
    ),
    lesson.uses_credits
      ? fetchAll(() => supabase.from('student_credit_ledger').select('*, students(full_name), profiles(full_name)').eq('class_id', lesson.id).order('occurred_at').order('id'))
      : Promise.resolve([]),
  ])
  return { enrolled: (enrolments || []).map((e) => e.students).filter(Boolean), marks, ledger }
}

function sheetFrom(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }))
  return ws
}

// Excel tab names: at most 31 characters, none of  \ / ? * [ ] :  and no two the same.
function sheetName(name, used) {
  let base = (name || 'Lesson').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Lesson'
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 27 - String(n).length)} ${n++}`
  used.add(candidate.toLowerCase())
  return candidate
}

const slug = (s) => (s || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson'

// Reads the attendance from the database and downloads an Excel file.
//   lessonId: one lesson's id, or 'all' for every lesson in `lessons`
export async function exportAttendance({ lessons, lessonId, from, to, orgId }) {
  const wb = XLSX.utils.book_new()
  const used = new Set()
  let filename
  let markCount = 0

  if (lessonId !== 'all') {
    const lesson = lessons.find((l) => l.id === lessonId)
    if (!lesson) throw new Error('Choose a lesson to export.')
    const data = await fetchLessonData(lesson, from, to, orgId)
    const built = buildLessonSheets({ lesson, ...data, from, to })
    if (built.markCount === 0) return { empty: true }
    markCount = built.markCount
    const gridWidths = [28, ...Array(Math.max(built.grid[3].length - 1, 0)).fill(12)]
    XLSX.utils.book_append_sheet(wb, sheetFrom(built.grid, gridWidths), sheetName('Attendance', used))
    XLSX.utils.book_append_sheet(wb, sheetFrom(built.records, [18, 10, 26, 10, 22, 26, 12]), sheetName('Records', used))
    if (built.credits) XLSX.utils.book_append_sheet(wb, sheetFrom(built.credits, [26, 26, 52, 10, 10, 22, 30]), sheetName('Credits', used))
    filename = `attendance-${slug(lesson.name)}-${from}-to-${to}.xlsx`
  } else {
    const allRecords = [['Lesson', 'Date', 'Session', 'Student', 'Status', 'Marked by', 'Marked at']]
    for (const lesson of lessons) {
      const data = await fetchLessonData({ ...lesson, uses_credits: false }, from, to, orgId)
      const built = buildLessonSheets({ lesson: { ...lesson, uses_credits: false }, ...data, from, to })
      if (built.markCount === 0) continue
      markCount += built.markCount
      XLSX.utils.book_append_sheet(wb, sheetFrom(built.grid, [28, ...Array(Math.max(built.grid[3].length - 1, 0)).fill(12)]), sheetName(lesson.name, used))
      built.records.slice(1).forEach((r) => allRecords.push([lesson.name, ...r]))
    }
    if (markCount === 0) return { empty: true }
    XLSX.utils.book_append_sheet(wb, sheetFrom(allRecords, [26, 18, 10, 26, 10, 22, 26]), sheetName('All records', used))
    filename = `attendance-all-lessons-${from}-to-${to}.xlsx`
  }

  XLSX.writeFile(wb, filename)
  return { empty: false, filename, markCount, sheets: wb.SheetNames.length }
}
