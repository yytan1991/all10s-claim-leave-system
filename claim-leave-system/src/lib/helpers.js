export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatMoney(amount) {
  const n = Number(amount || 0)
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Inclusive day count between two ISO date strings, excluding weekends.
export function countWorkingDays(startStr, endStr) {
  if (!startStr || !endStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count += 1
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function statusBadgeClass(status) {
  switch (status) {
    case 'approved':
      return 'badge-approved'
    case 'rejected':
      return 'badge-rejected'
    case 'cancelled':
      return 'badge-cancelled'
    default:
      return 'badge-pending'
  }
}

export function formatTime(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatHours(hoursDecimal) {
  if (hoursDecimal == null) return '—'
  const h = Math.floor(hoursDecimal)
  const m = Math.round((hoursDecimal - h) * 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function hoursBetween(startISO, endISO) {
  if (!startISO || !endISO) return null
  const ms = new Date(endISO) - new Date(startISO)
  return ms > 0 ? ms / 1000 / 60 / 60 : 0
}

// Compares a clock-in timestamp's time-of-day against a "HH:MM:SS" work_start_time.
export function isLateClockIn(clockInISO, workStartTime) {
  if (!clockInISO || !workStartTime) return false
  const clockIn = new Date(clockInISO)
  const [h, m] = workStartTime.split(':').map(Number)
  const scheduledStart = new Date(clockIn)
  scheduledStart.setHours(h, m, 0, 0)
  return clockIn > scheduledStart
}

export function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Builds a Monday-start calendar grid (array of weeks, each an array of 7
// Date objects) covering the given month plus the leading/trailing days
// needed to fill whole weeks.
export function getMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // Monday = 0
  const gridStart = new Date(year, monthIndex, 1 - startOffset)

  const weeks = []
  const cursor = new Date(gridStart)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (cursor.getMonth() !== monthIndex && cursor > firstOfMonth) break
  }
  return weeks
}
