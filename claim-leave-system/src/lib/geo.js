// Haversine distance between two lat/lng points, in meters.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Wraps navigator.geolocation in a promise.
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    )
  })
}

// Finds the nearest work location within its radius, or null if none match.
// Returns { location, distance } for the nearest one regardless, so callers
// can show "You're 340m from X" even on failure.
export function findNearestLocation(lat, lng, locations) {
  if (!locations?.length) return { location: null, distance: null, withinRange: false }

  let nearest = null
  let nearestDistance = Infinity

  for (const loc of locations) {
    const d = distanceMeters(lat, lng, loc.latitude, loc.longitude)
    if (d < nearestDistance) {
      nearest = loc
      nearestDistance = d
    }
  }

  const withinRange = nearest ? nearestDistance <= nearest.radius_meters : false
  return { location: nearest, distance: nearestDistance, withinRange }
}
