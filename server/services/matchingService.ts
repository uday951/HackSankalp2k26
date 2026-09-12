import { IRide } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { haversineDistanceMeters, routingService } from './routingService.js'

export interface MatchScoreDetails {
  total: number
  destination: number
  routeOverlap: number
  timeCompatibility: number
  pickupProximity: number
  detour: number
  directionSimilarity?: number
  activeBonus?: number
  driverDistanceMeters?: number
  routeOverlapPercent: number
  detourPercent: number
  additionalDistanceKm: number
  additionalDurationMinutes: number
  explanation: {
    destinationLabel: string
    routeLabel: string
    timeLabel: string
    proximityLabel: string
    detourLabel: string
    summary: string[]
  }
}

export interface RideMatchCandidate {
  rideId: string
  ride: IRide
  score: MatchScoreDetails
  availableSeats: number
  compatible: boolean
  estimatedExtraTimeMinutes: number
  estimatedExtraDistanceMeters: number
  driverDistanceMeters?: number
  matchingReason?: string
}

export function calculateDirectionSimilarity(
  a: { lat: number; lng: number } | number,
  b: { lat: number; lng: number } | number,
  c?: { lat: number; lng: number } | number,
  d?: { lat: number; lng: number } | number,
  lat3?: number,
  lng3?: number,
  lat4?: number,
  lng4?: number
): number {
  let startA: { lat: number; lng: number }
  let endA: { lat: number; lng: number }
  let startB: { lat: number; lng: number }
  let endB: { lat: number; lng: number }

  if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && typeof d === 'number') {
    startA = { lat: a, lng: b }
    endA = { lat: c, lng: d }
    startB = { lat: lat3 ?? 0, lng: lng3 ?? 0 }
    endB = { lat: lat4 ?? 0, lng: lng4 ?? 0 }
  } else {
    startA = a as { lat: number; lng: number }
    endA = b as { lat: number; lng: number }
    startB = c as { lat: number; lng: number }
    endB = d as { lat: number; lng: number }
  }

  const dLatA = endA.lat - startA.lat
  const dLngA = (endA.lng - startA.lng) * Math.cos(((startA.lat + endA.lat) / 2) * (Math.PI / 180))
  const dLatB = endB.lat - startB.lat
  const dLngB = (endB.lng - startB.lng) * Math.cos(((startB.lat + endB.lat) / 2) * (Math.PI / 180))

  const magA = Math.sqrt(dLatA * dLatA + dLngA * dLngA)
  const magB = Math.sqrt(dLatB * dLatB + dLngB * dLngB)

  if (magA < 0.0001 || magB < 0.0001) return 1.0 // Stationary or identical
  const dot = dLatA * dLatB + dLngA * dLngB
  const cosSim = dot / (magA * magB)
  return Math.max(-1, Math.min(1, cosSim))
}

// Parse "8:15 AM" -> minutes since midnight
function parseTimeToMinutes(t: string): number {
  if (!t) return 480 // 8:00 AM default
  const parts = t.trim().split(' ')
  const timePart = parts[0]
  const period = parts[1] || 'AM'
  const [hStr, mStr] = timePart.split(':')
  let hours = parseInt(hStr, 10) || 0
  const minutes = parseInt(mStr, 10) || 0
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

function getRatingLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Poor'
}

export class MatchingService {
  /**
   * Evaluates a single ride against a booking request
   */
  async evaluateMatch(
    ride: IRide,
    request: {
      pickupName: string
      pickupLat: number
      pickupLng: number
      destinationName: string
      destinationLat: number
      destinationLng: number
      requestedTime: string
      seatsRequested: number
      genderPreference?: string
      requestingStudentId?: string
    }
  ): Promise<RideMatchCandidate> {
    const availableSeats = ride.capacity - ride.bookedSeats

    // 0. Female-Only Strict Safety & Group Compatibility Check
    const requestingStudent = request.requestingStudentId
      ? await UserModel.findOne({ id: request.requestingStudentId })
      : null
    const requestingGender = requestingStudent?.gender || 'Prefer not to say'
    const isRideFemaleOnly = Boolean(
      (ride as any).isFemaleOnly ||
      (ride as any).genderPreference === 'FEMALE_ONLY' ||
      ride.passengers.some((p: any) => p.genderPreference === 'FEMALE_ONLY')
    )

    // Rule 1: If the ride is already female-only, male passengers CANNOT match
    if (isRideFemaleOnly && requestingGender === 'Male') {
      return this.buildIncompatibleResponse(ride, availableSeats, 'This ride is reserved for female passengers only. Male passengers cannot join.')
    }

    // Rule 2: If requesting student requested FEMALE_ONLY:
    if (request.genderPreference === 'FEMALE_ONLY') {
      // Male student cannot request female-only
      if (requestingGender === 'Male') {
        return this.buildIncompatibleResponse(ride, availableSeats, 'Female-only preference is available for female passengers only.')
      }

      // Check existing passengers in the candidate ride: must not contain any male passengers
      const passengerIds = ride.passengers.map((p) => p.studentId)
      if (passengerIds.length > 0) {
        const existingPassengers = await UserModel.find({ id: { $in: passengerIds } })
        const hasMale = existingPassengers.some((p) => p.gender === 'Male')
        if (hasMale) {
          return this.buildIncompatibleResponse(ride, availableSeats, 'Ride group contains male passengers.')
        }
      }
    }

    // Rule 3: If candidate ride has ANY passenger who booked with FEMALE_ONLY, male passengers CANNOT match
    if (requestingGender === 'Male') {
      const hasFemaleOnlyPassenger = ride.passengers.some((p: any) => p.genderPreference === 'FEMALE_ONLY')
      if (hasFemaleOnlyPassenger) {
        return this.buildIncompatibleResponse(ride, availableSeats, 'Ride contains passengers who requested female-only commute.')
      }
    }

    // 1. Determine Driver/Vehicle actual current coordinates:
    const vehicleLat = typeof (ride as any).currentLat === 'number' && (ride as any).currentLat !== 0
      ? (ride as any).currentLat
      : typeof (ride as any).startLocationLat === 'number' && (ride as any).startLocationLat !== 0
      ? (ride as any).startLocationLat
      : (ride.pickupPoints?.[0]?.lat ?? ride.destinationLat)

    const vehicleLng = typeof (ride as any).currentLng === 'number' && (ride as any).currentLng !== 0
      ? (ride as any).currentLng
      : typeof (ride as any).startLocationLng === 'number' && (ride as any).startLocationLng !== 0
      ? (ride as any).startLocationLng
      : (ride.pickupPoints?.[0]?.lng ?? ride.destinationLng)

    const driverDistMeters = haversineDistanceMeters(vehicleLat, vehicleLng, request.pickupLat, request.pickupLng)

    // Check closest static route waypoint
    let minRoutePickupDist = Infinity
    for (const pp of (ride.pickupPoints || [])) {
      const d = haversineDistanceMeters(pp.lat, pp.lng, request.pickupLat, request.pickupLng)
      if (d < minRoutePickupDist) minRoutePickupDist = d
    }
    if (minRoutePickupDist === Infinity) {
      minRoutePickupDist = driverDistMeters
    }

    // 2. Driver & Pickup Proximity (40% Weight)
    // Driver current proximity is the primary decider. Distant vehicles (> 10 km) are severely penalized.
    let driverProxScore = 0
    if (driverDistMeters <= 800) driverProxScore = 100
    else if (driverDistMeters <= 1500) driverProxScore = 95
    else if (driverDistMeters <= 3000) driverProxScore = 85
    else if (driverDistMeters <= 5000) driverProxScore = 70
    else if (driverDistMeters <= 8000) driverProxScore = 50
    else if (driverDistMeters <= 12000) driverProxScore = 25
    else if (driverDistMeters <= 18000) driverProxScore = 10
    else driverProxScore = 0

    const routeProxScore =
      minRoutePickupDist < 400 ? 100 : minRoutePickupDist < 1000 ? 85 : minRoutePickupDist < 2500 ? 65 : minRoutePickupDist < 5000 ? 40 : 10

    // Blend: 75% driver real-time distance + 25% route waypoint proximity
    const proxScore = Math.round(driverProxScore * 0.75 + routeProxScore * 0.25)

    // 3. Active Ride Priority Bonus (15% Weight)
    // Active drivers currently on the road ready to serve passengers get top priority
    let activeScore = 50
    if (ride.status === 'active') {
      activeScore = 100
    } else if (ride.status === 'boarding') {
      activeScore = 80
    } else if (ride.status === 'waiting') {
      activeScore = 60
    }

    // Direction and trajectory vector alignment
    const directionSim = calculateDirectionSimilarity(
      { lat: vehicleLat, lng: vehicleLng },
      { lat: ride.destinationLat, lng: ride.destinationLng },
      { lat: request.pickupLat, lng: request.pickupLng },
      { lat: request.destinationLat, lng: request.destinationLng }
    )

    const destDistMeters = haversineDistanceMeters(
      ride.destinationLat,
      ride.destinationLng,
      request.destinationLat,
      request.destinationLng
    )

    // Hard constraint: If directions are divergent (cos < -0.2) and destinations are far (> 3 km), cannot share trip
    if (directionSim < -0.2 && destDistMeters > 3000) {
      return this.buildIncompatibleResponse(
        ride,
        availableSeats,
        'Opposite route direction: passenger destination diverges significantly from trip route.'
      )
    }

    // 4. Destination Compatibility (15% Weight)
    let destScore = 20
    if (
      ride.destination.toLowerCase() === request.destinationName.toLowerCase() ||
      ride.destination.toLowerCase().includes(request.destinationName.toLowerCase()) ||
      request.destinationName.toLowerCase().includes(ride.destination.toLowerCase())
    ) {
      destScore = 100
    } else {
      if (destDistMeters < 800) destScore = 90
      else if (destDistMeters < 2000) destScore = 75
      else if (destDistMeters < 4000) destScore = 50
      else if (destDistMeters < 7000) destScore = 30
      else destScore = 10
    }

    // 5. Time Compatibility (5% Weight)
    const reqMins = parseTimeToMinutes(request.requestedTime)
    const rideMins = parseTimeToMinutes(ride.departureTime)
    const deltaMins = Math.abs(reqMins - rideMins)

    const timeScore =
      deltaMins <= 10 ? 100 : deltaMins <= 20 ? 85 : deltaMins <= 35 ? 65 : deltaMins <= 60 ? 40 : 20

    // 6. Detour & Route Overlap (15% Route Overlap + 10% Detour)
    let extraDistance = 0
    let extraSeconds = 0
    let detourScore = 80
    let routeScore = 70
    let percentDetour = 0

    if (driverDistMeters < 500 || minRoutePickupDist < 400) {
      routeScore = 95
      detourScore = 95
      extraSeconds = 60
      extraDistance = 150
      percentDetour = 2
    } else {
      const existingWaypoints: [number, number][] = [
        [vehicleLat, vehicleLng],
        ...ride.pickupPoints.map((pp) => [pp.lat, pp.lng] as [number, number]),
        [ride.destinationLat, ride.destinationLng],
      ]

      const detourResult = await routingService.calculateDetour(existingWaypoints, [
        request.pickupLat,
        request.pickupLng,
      ])

      extraDistance = detourResult.extraDistanceMeters
      extraSeconds = detourResult.extraDurationSeconds
      percentDetour = detourResult.percentDetour

      detourScore =
        extraSeconds <= 120 ? 95 : extraSeconds <= 300 ? 80 : extraSeconds <= 450 ? 55 : 20

      routeScore = Math.max(20, Math.round(100 - detourResult.percentDetour * 2.5))
    }

    // Strict Detour Constraint: More than 40% detour or more than 12 min extra delay is rejected
    if (percentDetour > 40 || extraSeconds > 720) {
      return this.buildIncompatibleResponse(
        ride,
        availableSeats,
        `Excessive detour (${Math.round(percentDetour)}% detour, +${Math.round(extraSeconds / 60)} min). Requires separate vehicle.`
      )
    }

    // Total weighted score (40% Prox + 15% Active + 15% Route + 15% Dest + 10% Detour + 5% Time)
    const totalScore = Math.round(
      proxScore * 0.40 +
      activeScore * 0.15 +
      routeScore * 0.15 +
      destScore * 0.15 +
      detourScore * 0.10 +
      timeScore * 0.05
    )

    // Dynamic Summary Reasons
    const summary: string[] = []
    if (driverDistMeters <= 2000) {
      summary.push(`Nearest active driver (${(driverDistMeters / 1000).toFixed(1)} km away)`)
    } else if (driverDistMeters <= 5000) {
      summary.push(`Driver nearby (${(driverDistMeters / 1000).toFixed(1)} km away)`)
    } else if (driverDistMeters > 10000) {
      summary.push(`Long drive (${(driverDistMeters / 1000).toFixed(1)} km away)`)
    }
    if (ride.status === 'active') summary.push('Live active ride')
    if (destScore >= 80) summary.push('Same destination')
    if (minRoutePickupDist < 600) summary.push(`Pickup stop within ${Math.round(minRoutePickupDist)}m`)
    if (routeScore >= 75) summary.push(`${Math.round(routeScore)}% route overlap`)
    if (extraSeconds <= 180) summary.push(`Only +${Math.round(extraSeconds / 60)} min detour`)

    const scoreDetails: MatchScoreDetails = {
      total: totalScore,
      destination: destScore,
      routeOverlap: routeScore,
      timeCompatibility: timeScore,
      pickupProximity: proxScore,
      detour: detourScore,
      directionSimilarity: Math.round(directionSim * 100) / 100,
      activeBonus: activeScore,
      driverDistanceMeters: Math.round(driverDistMeters),
      routeOverlapPercent: Math.round(routeScore),
      detourPercent: Math.round(percentDetour),
      additionalDistanceKm: Math.round(extraDistance / 100) / 10,
      additionalDurationMinutes: Math.round(extraSeconds / 60),
      explanation: {
        destinationLabel: getRatingLabel(destScore),
        routeLabel: getRatingLabel(routeScore),
        timeLabel: getRatingLabel(timeScore),
        proximityLabel: getRatingLabel(proxScore),
        detourLabel: getRatingLabel(detourScore),
        summary,
      },
    }

    const isCompatible =
      totalScore >= 50 &&
      availableSeats >= request.seatsRequested &&
      percentDetour <= 40 &&
      directionSim >= -0.2

    return {
      rideId: ride.id,
      ride,
      score: scoreDetails,
      availableSeats,
      compatible: isCompatible,
      estimatedExtraTimeMinutes: Math.round(extraSeconds / 60),
      estimatedExtraDistanceMeters: Math.round(extraDistance),
      driverDistanceMeters: Math.round(driverDistMeters),
      matchingReason: isCompatible ? 'ROUTE_COMPATIBLE_SHARED_TRIP' : 'INSUFFICIENT_COMPATIBILITY',
    }
  }

  /**
   * Search and rank best matching rides from active database rides
   */
  async findBestRideMatches(
    rides: IRide[],
    request: {
      pickupName: string
      pickupLat: number
      pickupLng: number
      destinationName: string
      destinationLat: number
      destinationLng: number
      requestedTime: string
      seatsRequested: number
      genderPreference?: string
      requestingStudentId?: string
    }
  ): Promise<RideMatchCandidate[]> {
    const candidates: RideMatchCandidate[] = []

    for (const ride of rides) {
      if (
        ride.status === 'completed' ||
        ride.status === 'cancelled' ||
        ride.status === 'full' ||
        ride.bookedSeats + request.seatsRequested > ride.capacity
      ) {
        continue
      }

      const match = await this.evaluateMatch(ride, request)
      if (match.score.total >= 35) {
        candidates.push(match)
      }
    }

    // Sort descending by score, and break close scores (<= 8 pts) with nearest driver distance
    return candidates.sort((a, b) => {
      const scoreDiff = b.score.total - a.score.total
      if (Math.abs(scoreDiff) <= 8) {
        const distA = a.driverDistanceMeters ?? Infinity
        const distB = b.driverDistanceMeters ?? Infinity
        if (distA !== distB) {
          return distA - distB
        }
      }
      return scoreDiff
    })
  }

  private buildIncompatibleResponse(ride: IRide, availableSeats: number, reason: string): RideMatchCandidate {
    return {
      rideId: ride.id,
      ride,
      score: {
        total: 0,
        destination: 0,
        routeOverlap: 0,
        timeCompatibility: 0,
        pickupProximity: 0,
        detour: 0,
        directionSimilarity: -1,
        routeOverlapPercent: 0,
        detourPercent: 100,
        additionalDistanceKm: 0,
        additionalDurationMinutes: 0,
        explanation: {
          destinationLabel: 'Incompatible',
          routeLabel: 'Incompatible',
          timeLabel: 'Incompatible',
          proximityLabel: 'Incompatible',
          detourLabel: 'Incompatible',
          summary: [reason],
        },
      },
      availableSeats,
      compatible: false,
      estimatedExtraTimeMinutes: 0,
      estimatedExtraDistanceMeters: 0,
      matchingReason: reason,
    }
  }

  calculateDirectionSimilarity = calculateDirectionSimilarity
}

export const matchingService = new MatchingService()
