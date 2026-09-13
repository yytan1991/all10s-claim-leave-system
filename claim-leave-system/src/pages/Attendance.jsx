import { useEffect, useState } from 'react'
import { MapPin, LogIn, LogOut, Clock, Coffee } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import { Alert, EmptyState } from '../components/UI'
import { getCurrentPosition, findNearestLocation } from '../lib/geo'
import { formatDate, formatTime, formatHours, netHoursWorked, lunchHours, isLateClockIn, toISODate } from '../lib/helpers'

function todayStr() {
  return toISODate(new Date())
}

export default function Attendance() {
  const { profile } = useAuth()
  const [locations, setLocations] = useState([])
  const [today, setToday] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!profile) return
    load()
  }, [profile])

  async function load() {
    setLoading(true)
    const [{ data: locs }, { data: todayRow }, { data: hist }] = await Promise.all([
      supabase.from('work_locations').select('*'),
      supabase
        .from('attendance_records')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('date', todayStr())
        .maybeSingle(),
      supabase
        .from('attendance_records')
        .select('*, work_locations(name)')
        .eq('profile_id', profile.id)
        .order('date', { ascending: false })
        .limit(14),
    ])
    setLocations(locs || [])
    setToday(todayRow || null)
    setHistory(hist || [])
    setLoading(false)
  }

  // Shared geofence check used by clock in/out and lunch start/end.
  async function checkLocation(actionLabel) {
    const pos = await getCurrentPosition()
    const { location, distance, withinRange } = findNearestLocation(pos.lat, pos.lng, locations)
    if (!withinRange) {
      throw new Error(
        location
          ? `You're about ${Math.round(distance)}m from ${location.name} — you need to be within ${location.radius_meters}m to ${actionLabel}.`
          : 'No work locations have been set up yet. Ask your admin to add one.'
      )
    }
    return { pos, location }
  }

  async function handleClockIn() {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      const { pos, location } = await checkLocation('clock in')
      const now = new Date().toISOString()
      const late = isLateClockIn(now, profile.work_start_time)

      const { data, error: insertError } = await supabase
        .from('attendance_records')
        .insert({
          profile_id: profile.id,
          work_location_id: location.id,
          date: todayStr(),
          clock_in_at: now,
          clock_in_lat: pos.lat,
          clock_in_lng: pos.lng,
          is_late: late,
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
      } else {
        setToday(data)
        setNotice(`Clocked in at ${location.name}${late ? ' — marked late' : ''}.`)
        load()
      }
    } catch (err) {
      setError(err.message || 'Could not get your location. Please allow location access and try again.')
    }
    setWorking(false)
  }

  async function handleLunchStart() {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      const { pos, location } = await checkLocation('start your lunch break')
      const now = new Date().toISOString()
      const { data, error: updateError } = await supabase
        .from('attendance_records')
        .update({ lunch_start_at: now, lunch_start_lat: pos.lat, lunch_start_lng: pos.lng })
        .eq('id', today.id)
        .select()
        .single()

      if (updateError) {
        setError(updateError.message)
      } else {
        setToday(data)
        setNotice('Lunch break started. Enjoy your meal!')
        load()
      }
    } catch (err) {
      setError(err.message || 'Could not get your location. Please allow location access and try again.')
    }
    setWorking(false)
  }

  async function handleLunchEnd() {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      const { pos } = await checkLocation('end your lunch break')
      const now = new Date().toISOString()
      const { data, error: updateError } = await supabase
        .from('attendance_records')
        .update({ lunch_end_at: now, lunch_end_lat: pos.lat, lunch_end_lng: pos.lng })
        .eq('id', today.id)
        .select()
        .single()

      if (updateError) {
        setError(updateError.message)
      } else {
        setToday(data)
        setNotice('Lunch break ended. Back to work!')
        load()
      }
    } catch (err) {
      setError(err.message || 'Could not get your location. Please allow location access and try again.')
    }
    setWorking(false)
  }

  async function handleClockOut() {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      const { pos } = await checkLocation('clock out')
      const now = new Date().toISOString()
      const { data, error: updateError } = await supabase
        .from('attendance_records')
        .update({ clock_out_at: now, clock_out_lat: pos.lat, clock_out_lng: pos.lng })
        .eq('id', today.id)
        .select()
        .single()

      if (updateError) {
        setError(updateError.message)
      } else {
        setToday(data)
        setNotice('Clocked out. See you next time!')
        load()
      }
    } catch (err) {
      setError(err.message || 'Could not get your location. Please allow location access and try again.')
    }
    setWorking(false)
  }

  const onLunchBreak = today?.lunch_start_at && !today?.lunch_end_at

  return (
    <AppLayout title="Attendance" subtitle="Clock in and out from a registered work location.">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card p-6 lg:col-span-1 flex flex-col items-center text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700 mb-3">
            <Clock size={22} />
          </div>
          <p className="text-sm text-ink-500">{formatDate(todayStr())}</p>

          {loading ? (
            <p className="mt-4 text-sm text-ink-500">Loading…</p>
          ) : !today ? (
            <>
              <p className="mt-2 font-medium text-ink-900">You haven't clocked in today</p>
              <button onClick={handleClockIn} disabled={working} className="btn-primary mt-4 w-full">
                <LogIn size={16} /> {working ? 'Checking location…' : 'Clock In'}
              </button>
            </>
          ) : !today.clock_out_at ? (
            <>
              <p className="mt-2 font-medium text-ink-900">Clocked in at {formatTime(today.clock_in_at)}</p>
              {today.is_late && <p className="text-sm text-rose-500 font-medium">Marked late</p>}

              {onLunchBreak && (
                <p className="text-sm text-amber-600 font-medium mt-1">
                  On lunch break since {formatTime(today.lunch_start_at)}
                </p>
              )}
              {today.lunch_start_at && today.lunch_end_at && (
                <p className="text-xs text-ink-500 mt-1">
                  Lunch: {formatTime(today.lunch_start_at)} – {formatTime(today.lunch_end_at)}
                </p>
              )}

              <div className="w-full space-y-2 mt-4">
                {!today.lunch_start_at && (
                  <button onClick={handleLunchStart} disabled={working} className="btn-secondary w-full">
                    <Coffee size={16} /> {working ? 'Checking location…' : 'Start Lunch'}
                  </button>
                )}
                {onLunchBreak && (
                  <button onClick={handleLunchEnd} disabled={working} className="btn-secondary w-full">
                    <Coffee size={16} /> {working ? 'Checking location…' : 'End Lunch'}
                  </button>
                )}
                <button
                  onClick={handleClockOut}
                  disabled={working || onLunchBreak}
                  className="btn-primary w-full"
                  title={onLunchBreak ? 'End your lunch break first' : undefined}
                >
                  <LogOut size={16} /> {working ? 'Checking location…' : 'Clock Out'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 font-medium text-ink-900">
                {formatTime(today.clock_in_at)} – {formatTime(today.clock_out_at)}
              </p>
              {today.is_late && <p className="text-sm text-rose-500 font-medium">Marked late</p>}
              {today.lunch_start_at && today.lunch_end_at && (
                <p className="text-xs text-ink-500 mt-1">
                  Lunch: {formatTime(today.lunch_start_at)} – {formatTime(today.lunch_end_at)} (
                  {formatHours(lunchHours(today))})
                </p>
              )}
              <p className="mt-1 text-sm text-ink-500">
                {formatHours(netHoursWorked(today))} worked today
              </p>
            </>
          )}

          {error && (
            <div className="mt-4 w-full text-left">
              <Alert tone="rose">{error}</Alert>
            </div>
          )}
          {notice && !error && (
            <div className="mt-4 w-full text-left">
              <Alert tone="brand">{notice}</Alert>
            </div>
          )}

          <p className="mt-4 flex items-center gap-1 text-xs text-ink-500">
            <MapPin size={12} /> Location is checked only at the moment you clock in/out.
          </p>
        </div>

        <div className="card lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-sand-200">
            <h3 className="font-semibold text-ink-900">Your recent attendance</h3>
          </div>
          {history.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No attendance recorded yet"
              description="Clock in for the first time and it will show up here."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-sand-100 text-ink-500 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Clock in</th>
                  <th className="px-5 py-3 font-medium">Clock out</th>
                  <th className="px-5 py-3 font-medium">Lunch</th>
                  <th className="px-5 py-3 font-medium">Hours</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-ink-700">{formatDate(r.date)}</td>
                    <td className={`px-5 py-3 ${r.is_late ? 'text-rose-500 font-medium' : 'text-ink-700'}`}>
                      {formatTime(r.clock_in_at)}
                      {r.is_late && ' (late)'}
                    </td>
                    <td className="px-5 py-3 text-ink-700">{formatTime(r.clock_out_at)}</td>
                    <td className="px-5 py-3 text-ink-500 text-xs">
                      {r.lunch_start_at ? `${formatTime(r.lunch_start_at)}–${formatTime(r.lunch_end_at)}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-700">{formatHours(netHoursWorked(r))}</td>
                    <td className="px-5 py-3 text-ink-500">{r.work_locations?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}