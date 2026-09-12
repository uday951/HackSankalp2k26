import { CURATED_LANDMARKS } from '../geocoding/geocodingService'
import {
  fetchOsrmRoute,
  fetchOsrmTable,
  haversineMeters,
  matchOsrmTrace,
} from './osrm'
import type {
  Coordinate,
  RouteResult,
  DetourResult,
  RouteCompatibilityResult,
} from './types'

// Centralized campus locations with accurate coordinates
export const CAMPUS_LOCATIONS: Record<string, Coordinate & { name: string; zone: string }> = {
  'Sri Indu Boys Hostel': { name: 'Sri Indu Boys Hostel', lat: 17.398, lng: 78.479, zone: 'North Residential' },
  'Sri Indu Girls Hostel': { name: 'Sri Indu Girls Hostel', lat: 17.396, lng: 78.481, zone: 'North Residential' },
  'Campus Transit Terminal': { name: 'Campus Transit Terminal', lat: 17.395, lng: 78.484, zone: 'East Residential' },
  'Sri Indu College Main Gate': { name: 'Sri Indu College Main Gate', lat: 17.392, lng: 78.482, zone: 'Campus Entry' },
  'Hostel A': { name: 'Sri Indu Boys Hostel', lat: 17.398, lng: 78.479, zone: 'North Residential' },
  'Hostel B': { name: 'Sri Indu Girls Hostel', lat: 17.396, lng: 78.481, zone: 'North Residential' },
  'Hostel C': { name: 'Campus Transit Terminal', lat: 17.395, lng: 78.484, zone: 'East Residential' },
  'PG Zone': { name: 'PG Zone', lat: 17.394, lng: 78.476, zone: 'West Residential' },
  'Railway Station': { name: 'Railway Station', lat: 17.4, lng: 78.485, zone: 'Transit Hub' },
  'Metro Station': { name: 'Metro Station', lat: 17.397, lng: 78.49, zone: 'Transit Hub' },
  'Main Gate': { name: 'Sri Indu College Main Gate', lat: 17.392, lng: 78.482, zone: 'Campus Entry' },
  'Main Campus': { name: 'Main Campus', lat: 17.387, lng: 78.486, zone: 'Academic South' },
  'Engineering Block': { name: 'Engineering Block', lat: 17.386, lng: 78.487, zone: 'Academic South' },
  Library: { name: 'Library', lat: 17.3865, lng: 78.4855, zone: 'Academic Core' },
}

// Configurable constraints
export const ROUTING_CONSTRAINTS = {
  MAX_EXTRA_DURATION_MINUTES: 5,
  MAX_DETOUR_PERCENT: 15,
  ROUTE_DEVIATION_THRESHOLD_METERS: 150,
  CAMPUS_SPEED_KMH: 25,
}

export class FrontendRoutingService {
  /**
   * Resolve a location name or Coordinate to a Coordinate
   */
  resolveCoordinate(loc: string | Coordinate): Coordinate {
    if (typeof loc === 'string') {
      const found = CAMPUS_LOCATIONS[loc]
      if (found) return { lat: found.lat, lng: found.lng }

      const landmark = CURATED_LANDMARKS.find((l) =>
        l.name.toLowerCase().includes(loc.toLowerCase()) || loc.toLowerCase().includes(l.name.toLowerCase())
      )
      if (landmark) return { lat: landmark.lat, lng: landmark.lng }

      return { lat: 17.4934, lng: 78.3995 }
    }
    return loc
  }

  /**
   * Get road-routed directions using OSRM
   */
  async getRoute(waypoints: (string | Coordinate)[]): Promise<RouteResult> {
    const coords = waypoints.map((w) => this.resolveCoordinate(w))
    return fetchOsrmRoute(coords)
  }

  /**
   * Format seconds to human friendly duration
   */
  formatDuration(seconds: number): string {
    const mins = Math.max(1, Math.round(seconds / 60))
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60)
      const rem = mins % 60
      return `${hrs} hr ${rem > 0 ? `${rem} min` : ''}`
    }
    return `${mins} min`
  }

  /**
   * Format meters to km
   */
  formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`
    }
    return `${Math.round(meters)} m`
  }

  /**
   * Dynamic pickup insertion:
   * Given existing stops [A, B, Campus] and a new stop C,
   * evaluates candidate insertions [A, C, B, Campus], [A, B, C, Campus]
   * and picks the minimal detour.
   */
  async calculateDetour(
    existingWaypoints: (string | Coordinate)[],
    newStop: string | Coordinate,
    maxExtraMinutes = ROUTING_CONSTRAINTS.MAX_EXTRA_DURATION_MINUTES,
    maxDetourPercent = ROUTING_CONSTRAINTS.MAX_DETOUR_PERCENT
  ): Promise<DetourResult> {
    const baseCoords = existingWaypoints.map((w) => this.resolveCoordinate(w))
    const newCoord = this.resolveCoordinate(newStop)

    // Base route
    const baseRoute = await fetchOsrmRoute(baseCoords)

    let bestResult: DetourResult = {
      bestOrder: [...baseCoords.slice(0, -1), newCoord, baseCoords[baseCoords.length - 1]],
      bestIndices: [0, baseCoords.length - 1],
      originalDurationSeconds: baseRoute.durationSeconds,
      newDurationSeconds: baseRoute.durationSeconds + 180,
      extraDurationSeconds: 180,
      extraDistanceMeters: 800,
      percentDetour: 10,
      isAcceptable: true,
    }

    let minExtraSeconds = Infinity

    // Test candidate insertion between intermediate stops
    for (let i = 1; i < baseCoords.length; i++) {
      const candidate: Coordinate[] = [
        ...baseCoords.slice(0, i),
        newCoord,
        ...baseCoords.slice(i),
      ]

      const candidateRoute = await fetchOsrmRoute(candidate)
      const extraSecs = Math.max(0, candidateRoute.durationSeconds - baseRoute.durationSeconds)
      const extraDist = Math.max(0, candidateRoute.distanceMeters - baseRoute.distanceMeters)
      const pct = baseRoute.distanceMeters > 0 ? (extraDist / baseRoute.distanceMeters) * 100 : 0

      if (extraSecs < minExtraSeconds) {
        minExtraSeconds = extraSecs
        const isAcceptable =
          extraSecs <= maxExtraMinutes * 60 && pct <= maxDetourPercent + 5

        bestResult = {
          bestOrder: candidate,
          bestIndices: [i],
          originalDurationSeconds: baseRoute.durationSeconds,
          newDurationSeconds: candidateRoute.durationSeconds,
          extraDurationSeconds: extraSecs,
          extraDistanceMeters: extraDist,
          percentDetour: Math.round(pct * 10) / 10,
          isAcceptable,
        }
      }
    }

    return bestResult
  }

  /**
   * Evaluate route compatibility between an active ride and a student request
   */
  async evaluateRouteCompatibility(
    rideStops: (string | Coordinate)[],
    studentPickup: string | Coordinate,
    studentDest: string | Coordinate
  ): Promise<RouteCompatibilityResult> {
    const pickupCoord = this.resolveCoordinate(studentPickup)
    const destCoord = this.resolveCoordinate(studentDest)
    const rideCoords = rideStops.map((s) => this.resolveCoordinate(s))

    const rideDest = rideCoords[rideCoords.length - 1]
    const destDist = haversineMeters(rideDest, destCoord)
    const sameDestination = destDist < 400

    // Detour test
    const detour = await this.calculateDetour(rideCoords, pickupCoord)
    const extraMins = Math.round(detour.extraDurationSeconds / 60)

    let score = 50
    const reasons: string[] = []

    if (sameDestination) {
      score += 30
      reasons.push('Same destination')
    } else if (destDist < 1200) {
      score += 15
      reasons.push('Destination within walking radius')
    }

    if (detour.extraDurationSeconds <= 120) {
      score += 20
      reasons.push('Minimal detour (+1-2 min)')
    } else if (detour.isAcceptable) {
      score += 10
      reasons.push(`Acceptable detour (+${extraMins} min)`)
    }

    const overlapPct = Math.max(10, Math.round(100 - detour.percentDetour * 2))
    reasons.push(`${overlapPct}% route overlap`)

    return {
      score: Math.min(100, score),
      routeCompatible: detour.isAcceptable && (sameDestination || destDist < 1200),
      overlapPercent: overlapPct,
      extraMinutes: extraMins,
      reasons,
    }
  }

  /**
   * Check if current vehicle position is off the planned route geometry
   */
  checkRouteDeviation(
    currentLat: number,
    currentLng: number,
    routeGeometry: [number, number][],
    thresholdMeters = ROUTING_CONSTRAINTS.ROUTE_DEVIATION_THRESHOLD_METERS
  ): { hasDeviation: boolean; distanceMeters: number } {
    if (!routeGeometry || routeGeometry.length < 2) {
      return { hasDeviation: false, distanceMeters: 0 }
    }

    let minDistance = Infinity
    for (let i = 0; i < routeGeometry.length - 1; i++) {
      const [lat1, lng1] = routeGeometry[i]
      const [lat2, lng2] = routeGeometry[i + 1]

      // Point-to-segment distance approximation
      const d = haversineMeters({ lat: currentLat, lng: currentLng }, { lat: lat1, lng: lng1 })
      if (d < minDistance) minDistance = d
    }

    return {
      hasDeviation: minDistance > thresholdMeters,
      distanceMeters: Math.round(minDistance),
    }
  }

  /**
   * Interpolate a vehicle position along a polyline based on 0..1 progress
   */
  interpolateVehiclePosition(
    geometry: [number, number][],
    progress: number
  ): [number, number] {
    if (!geometry || geometry.length === 0) return [17.398, 78.479]
    if (geometry.length === 1 || progress <= 0) return geometry[0]
    if (progress >= 1) return geometry[geometry.length - 1]

    const totalPoints = geometry.length
    const targetIdx = (totalPoints - 1) * progress
    const lowerIdx = Math.floor(targetIdx)
    const upperIdx = Math.min(totalPoints - 1, lowerIdx + 1)
    const fraction = targetIdx - lowerIdx

    const p1 = geometry[lowerIdx]
    const p2 = geometry[upperIdx]

    return [
      p1[0] + (p2[0] - p1[0]) * fraction,
      p1[1] + (p2[1] - p1[1]) * fraction,
    ]
  }
}

export const routingService = new FrontendRoutingService()
