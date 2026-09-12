import { IRide, IRouteStop, IRouteStep, ITripRoute, RideModel } from '../models/Ride.js'
import { VehicleModel } from '../models/Vehicle.js'
import { BookingModel } from '../models/Booking.js'
import { UserModel } from '../models/User.js'
import { RideStopModel } from '../models/RideStop.js'
import { routingService, haversineDistanceMeters } from './routingService.js'
import { realtimeService } from './realtimeService.js'
import { notificationService } from './notificationService.js'

export const ARRIVAL_RADIUS_METERS = 80
export const OFF_ROUTE_THRESHOLD_METERS = 120

// Perpendicular projection of point P onto line segment AB
function projectPointToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): { lat: number; lng: number; distMeters: number; ratio: number } {
  const dAB = haversineDistanceMeters(aLat, aLng, bLat, bLng)
  if (dAB < 1) {
    const dist = haversineDistanceMeters(pLat, pLng, aLat, aLng)
    return { lat: aLat, lng: aLng, distMeters: dist, ratio: 0 }
  }

  // Vector projection in equirectangular projection
  const cosLat = Math.cos(((aLat + bLat) / 2) * (Math.PI / 180))
  const dx = (bLng - aLng) * cosLat
  const dy = bLat - aLat
  const px = (pLng - aLng) * cosLat
  const py = pLat - aLat

  const dot = px * dx + py * dy
  const lenSq = dx * dx + dy * dy
  const ratio = Math.max(0, Math.min(1, dot / lenSq))

  const projLat = aLat + ratio * (bLat - aLat)
  const projLng = aLng + ratio * (bLng - aLng)
  const dist = haversineDistanceMeters(pLat, pLng, projLat, projLng)

  return { lat: projLat, lng: projLng, distMeters: dist, ratio }
}

export class RouteProgressService {
  /**
   * Build or initialize complete TripRoute and RouteStop[] from scratch using OSRM
   */
  async buildTripRoute(
    ride: IRide,
    customStartLat?: number,
    customStartLng?: number,
    customStartName?: string
  ): Promise<ITripRoute> {
    const originLat = customStartLat !== undefined ? customStartLat : (ride.startLocationLat ?? ride.currentLat ?? (ride.pickupPoints?.[0]?.lat ?? 17.4934))
    const originLng = customStartLng !== undefined ? customStartLng : (ride.startLocationLng ?? ride.currentLng ?? (ride.pickupPoints?.[0]?.lng ?? 78.3995))
    const originName = customStartName || ride.startLocation || ride.pickupPoints?.[0]?.name || 'Driver Starting Point'

    if (customStartLat !== undefined && customStartLng !== undefined) {
      ride.currentLat = customStartLat
      ride.currentLng = customStartLng
      ride.startLocationLat = customStartLat
      ride.startLocationLng = customStartLng
      if (customStartName) {
        ride.startLocation = customStartName
      }
    }

    // 1. Fetch all active bookings for this ride to get per-passenger destinations & pickups
    const bookings = await BookingModel.find({
      rideId: ride.id,
      status: { $ne: 'cancelled' },
    })

    // 2. Build Pickup Stops
    const pickupStops: IRouteStop[] = []
    const processedPickups = new Set<string>()

    // Check if originName should be the initial stop
    const originPassenger = (ride.passengers || []).find((p) => p.pickup.toLowerCase() === originName.toLowerCase())
    const originBooking = bookings.find((b) => b.pickup?.toLowerCase() === originName.toLowerCase())

    pickupStops.push({
      id: `stop-${ride.id}-origin`,
      bookingId: originBooking?.id,
      studentId: originPassenger?.studentId || originBooking?.studentId,
      type: 'PICKUP',
      name: originName,
      latitude: originLat,
      longitude: originLng,
      sequence: 1,
      status: ride.status === 'active'
        ? (originPassenger?.status === 'boarded' ? 'BOARDED' : originPassenger ? 'ARRIVED' : 'COMPLETED')
        : 'UPCOMING',
      estimatedArrival: 'Departed',
    })
    processedPickups.add(originName.toLowerCase())

    // First from ride.pickupPoints (official predefined stops)
    for (const pp of ride.pickupPoints || []) {
      if (processedPickups.has(pp.name.toLowerCase())) continue

      const passenger = (ride.passengers || []).find((p) => p.pickup.toLowerCase() === pp.name.toLowerCase())
      const b = bookings.find((item) => item.pickup?.toLowerCase() === pp.name.toLowerCase())

      // Skip unbooked template pickup points if driver has a custom start location
      if (!passenger && !b && (customStartName || ride.startLocation)) {
        continue
      }

      const stopId = `stop-${ride.id}-pickup-${pp.id || pp.name.toLowerCase().replace(/\s+/g, '-')}`

      pickupStops.push({
        id: stopId,
        bookingId: b?.id,
        studentId: passenger?.studentId || b?.studentId,
        type: 'PICKUP',
        name: pp.name,
        latitude: pp.lat,
        longitude: pp.lng,
        sequence: 0, // Assigned after ordering
        status: passenger?.status === 'boarded' || b?.status === 'in_transit'
          ? 'BOARDED'
          : passenger?.status === 'dropped' || b?.status === 'completed'
          ? 'COMPLETED'
          : 'UPCOMING',
        estimatedArrival: pp.estimatedPickupTime,
      })
      processedPickups.add(pp.name.toLowerCase())
    }

    // Include custom pickups from bookings that weren't in ride.pickupPoints
    for (const b of bookings) {
      if (b.pickup && !processedPickups.has(b.pickup.toLowerCase())) {
        const pLat = b.pickupLat || originLat
        const pLng = b.pickupLng || originLng
        const passenger = (ride.passengers || []).find((p) => p.studentId === b.studentId)
        const stopId = `stop-${ride.id}-pickup-${b.studentId}`

        pickupStops.push({
          id: stopId,
          bookingId: b.id,
          studentId: b.studentId,
          type: 'PICKUP',
          name: b.pickupName || b.pickup,
          address: b.pickupAddress,
          latitude: pLat,
          longitude: pLng,
          sequence: 0,
          status: passenger?.status === 'boarded' || b.status === 'in_transit'
            ? 'BOARDED'
            : passenger?.status === 'dropped' || b.status === 'completed'
            ? 'COMPLETED'
            : 'UPCOMING',
        })
        processedPickups.add(b.pickup.toLowerCase())
      }
    }

    // 3. Build Dropoff Stops for each distinct passenger destination
    const dropoffStops: IRouteStop[] = []
    const processedStudentDropoffs = new Set<string>()

    for (const b of bookings) {
      const destName = b.destinationName || b.destination || ride.destination
      const passenger = (ride.passengers || []).find((p) => p.studentId === b.studentId)
      const isDropped = passenger?.status === 'dropped' || b.status === 'completed'

      if (!processedStudentDropoffs.has(b.studentId)) {
        dropoffStops.push({
          id: `stop-${ride.id}-dropoff-${b.studentId}`,
          bookingId: b.id,
          studentId: b.studentId,
          type: 'DROPOFF',
          name: destName,
          address: b.destinationAddress,
          latitude: b.destinationLat || ride.destinationLat,
          longitude: b.destinationLng || ride.destinationLng,
          sequence: 0,
          status: isDropped ? 'COMPLETED' : 'UPCOMING',
        })
        processedStudentDropoffs.add(b.studentId)
      }
    }

    // Check passengers in ride.passengers who don't have a booking record
    for (const p of ride.passengers || []) {
      if (p.destination && !processedStudentDropoffs.has(p.studentId)) {
        dropoffStops.push({
          id: `stop-${ride.id}-dropoff-${p.studentId}`,
          studentId: p.studentId,
          type: 'DROPOFF',
          name: p.destination,
          latitude: ride.destinationLat,
          longitude: ride.destinationLng,
          sequence: 0,
          status: p.status === 'dropped' ? 'COMPLETED' : 'UPCOMING',
        })
        processedStudentDropoffs.add(p.studentId)
      }
    }

    // Always ensure terminal destination exists at the end
    const hasTerminal = dropoffStops.some(
      (s) =>
        s.name.toLowerCase() === ride.destination.toLowerCase() &&
        Math.abs(s.latitude - ride.destinationLat) < 0.001 &&
        Math.abs(s.longitude - ride.destinationLng) < 0.001
    )
    if (!hasTerminal) {
      dropoffStops.push({
        id: `stop-${ride.id}-terminal`,
        type: 'DROPOFF',
        name: ride.destination,
        latitude: ride.destinationLat,
        longitude: ride.destinationLng,
        sequence: 0,
        status: ride.status === 'completed' ? 'COMPLETED' : 'UPCOMING',
      })
    }

    // 4. Assemble complete ordered stop list: Pickups first, then Dropoffs
    const allStops = [...pickupStops, ...dropoffStops]
    allStops.forEach((s, idx) => {
      s.sequence = idx + 1
      s.id = `stop-${ride.id}-${idx + 1}`
    })

    // 5. Query OSRM for genuine road geometry connecting origin through all stops
    const waypoints: [number, number][] = [
      [originLat, originLng],
      ...allStops.map((s) => [s.latitude, s.longitude] as [number, number]),
    ]

    const routeResult = await routingService.getRoute(waypoints)

    // 6. Calculate per-stop estimated arrival times from OSRM legs
    if (routeResult.legs && routeResult.legs.length > 0) {
      let cumulativeSeconds = 0
      for (let i = 0; i < allStops.length; i++) {
        if (routeResult.legs[i]) {
          cumulativeSeconds += routeResult.legs[i].duration || 0
          const arrivalTime = new Date(Date.now() + cumulativeSeconds * 1000)
          allStops[i].estimatedArrival = arrivalTime.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        }
      }
    }

    // 7. Sync stops with RideStopModel in database
    try {
      await RideStopModel.deleteMany({ rideId: ride.id })
      const dbStops = allStops.map((s) => ({
        id: s.id,
        rideId: ride.id,
        bookingId: s.bookingId,
        studentId: s.studentId,
        stopOrder: s.sequence,
        stopType: s.type,
        locationName: s.name,
        address: s.address,
        lat: s.latitude,
        lng: s.longitude,
        estimatedArrival: s.estimatedArrival,
        status: s.status,
      }))
      await RideStopModel.insertMany(dbStops)
    } catch (err: any) {
      console.warn(`[RouteProgress] Could not sync RideStopModel: ${err.message}`)
    }

    const tripRoute: ITripRoute = {
      version: (ride.tripRoute?.version || 0) + 1,
      origin: { lat: originLat, lng: originLng, name: originName },
      destination: { lat: ride.destinationLat, lng: ride.destinationLng, name: ride.destination },
      geometry: routeResult.geometry,
      distanceMeters: routeResult.distanceMeters,
      durationSeconds: routeResult.durationSeconds,
      remainingDistanceMeters: routeResult.distanceMeters,
      remainingDurationSeconds: routeResult.durationSeconds,
      progressPercent: 0,
      currentStopIndex: 0,
      status: ride.status === 'active' ? 'NAVIGATING' : 'PLANNED',
      steps: (routeResult.steps || []).map((s) => ({
        instruction: s.instruction,
        distanceMeters: s.distanceMeters,
        durationSeconds: s.durationSeconds,
        maneuverType: s.maneuverType,
        roadName: s.roadName,
      })),
    }

    ride.stops = allStops
    ride.tripRoute = tripRoute
    ride.routeCoordinates = routeResult.geometry
    ride.distanceKm = Number((routeResult.distanceMeters / 1000).toFixed(1))
    ride.distanceMeters = routeResult.distanceMeters
    ride.durationSeconds = routeResult.durationSeconds

    await ride.save()
    return tripRoute
  }

  /**
   * Project vehicle coordinates onto route geometry and calculate real-time progress
   */
  async updateProgress(
    rideId: string,
    currentLat: number,
    currentLng: number,
    heading?: number,
    speed?: number
  ) {
    const ride = await RideModel.findOne({ id: rideId })
    if (!ride) throw new Error('Ride not found')

    // Initialize route if missing
    if (!ride.tripRoute || !ride.tripRoute.geometry || ride.tripRoute.geometry.length < 2) {
      await this.buildTripRoute(ride)
    }

    const geometry = ride.tripRoute!.geometry
    let minDistanceMeters = Infinity
    let closestSegIndex = 0
    let bestProj = { lat: currentLat, lng: currentLng, ratio: 0 }

    // Find closest segment on polyline
    for (let i = 0; i < geometry.length - 1; i++) {
      const pA = geometry[i]
      const pB = geometry[i + 1]
      const proj = projectPointToSegment(currentLat, currentLng, pA[0], pA[1], pB[0], pB[1])
      if (proj.distMeters < minDistanceMeters) {
        minDistanceMeters = proj.distMeters
        closestSegIndex = i
        bestProj = proj
      }
    }

    // Cumulative distance along route
    let distanceTraveledMeters = 0
    for (let i = 0; i < closestSegIndex; i++) {
      distanceTraveledMeters += haversineDistanceMeters(
        geometry[i][0],
        geometry[i][1],
        geometry[i + 1][0],
        geometry[i + 1][1]
      )
    }
    distanceTraveledMeters +=
      haversineDistanceMeters(
        geometry[closestSegIndex][0],
        geometry[closestSegIndex][1],
        geometry[closestSegIndex + 1][0],
        geometry[closestSegIndex + 1][1]
      ) * bestProj.ratio

    const totalDistanceMeters = ride.tripRoute!.distanceMeters || 1
    const remainingDistanceMeters = Math.max(0, Math.round(totalDistanceMeters - distanceTraveledMeters))
    const progressPercent = Math.min(100, Math.max(0, Math.round((distanceTraveledMeters / totalDistanceMeters) * 100)))

    const remainingDurationSeconds = Math.max(
      0,
      Math.round((remainingDistanceMeters / totalDistanceMeters) * (ride.tripRoute!.durationSeconds || 600))
    )

    const etaDate = new Date(Date.now() + remainingDurationSeconds * 1000)
    const etaString = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Off-route check
    const isOffRoute = minDistanceMeters > OFF_ROUTE_THRESHOLD_METERS
    if (isOffRoute) {
      ride.hasDeviation = true
      ride.tripRoute!.status = 'OFF_ROUTE'
      console.warn(`[RouteProgress] Vehicle off-route by ${Math.round(minDistanceMeters)}m on ride ${ride.id}`)
    } else {
      ride.hasDeviation = false
      if (ride.status === 'active' || ride.status === 'boarding') {
        ride.tripRoute!.status = 'NAVIGATING'
      }
    }

    // Update Next Stop & Arrival Detection
    let activeStopIndex = -1
    const stops = ride.stops || []
    for (let sIdx = 0; sIdx < stops.length; sIdx++) {
      const stop = stops[sIdx]
      if (stop.status === 'COMPLETED') continue

      const distToStop = haversineDistanceMeters(currentLat, currentLng, stop.latitude, stop.longitude)

      if (distToStop <= ARRIVAL_RADIUS_METERS) {
        if (stop.status === 'UPCOMING') {
          stop.status = 'ARRIVING'
          notificationService.notifyRideEvent('DRIVER_ARRIVING', {
            rideId,
            routeName: ride.routeName,
            driverId: ride.driverId,
            stopId: stop.id,
            stopName: stop.name,
            studentId: stop.studentId,
          }).catch((e) => console.warn('[RouteProgress] Notification warning:', e.message))
          realtimeService.broadcast('DRIVER_ARRIVING', { rideId, stopId: stop.id, stopName: stop.name })
        }
        if (distToStop <= 40 && stop.status !== 'ARRIVED' && stop.status !== 'BOARDED') {
          stop.status = 'ARRIVED'
          notificationService.notifyRideEvent('DRIVER_REACHED_PICKUP', {
            rideId,
            routeName: ride.routeName,
            driverId: ride.driverId,
            stopId: stop.id,
            stopName: stop.name,
            studentId: stop.studentId,
          }).catch((e) => console.warn('[RouteProgress] Notification warning:', e.message))
          realtimeService.broadcast('DRIVER_ARRIVED', { rideId, stopId: stop.id, stopName: stop.name })
        }
      }

      if (stop.status !== 'BOARDED') {
        activeStopIndex = sIdx
        break
      }
    }

    // Destination arrival check
    const distToDestination = haversineDistanceMeters(currentLat, currentLng, ride.destinationLat, ride.destinationLng)
    if (distToDestination <= ARRIVAL_RADIUS_METERS && stops.every((s: any) => s.type !== 'PICKUP' || s.status === 'BOARDED')) {
      if (ride.tripRoute!.status !== 'ARRIVING') {
        const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
        notificationService.notifyRideEvent('ARRIVED_DESTINATION', {
          rideId,
          routeName: ride.routeName,
          driverId: ride.driverId,
          destination: ride.destination,
          passengerIds,
        }).catch((e) => console.warn('[RouteProgress] Notification warning:', e.message))
      }
      ride.tripRoute!.status = 'ARRIVING'
      realtimeService.broadcast('ARRIVED_DESTINATION', { rideId, destination: ride.destination })
    }

    // Update Next Step Maneuver
    let nextStep: IRouteStep | undefined
    if (ride.tripRoute!.steps && ride.tripRoute!.steps.length > 0) {
      let stepAccum = 0
      for (const step of ride.tripRoute!.steps) {
        stepAccum += step.distanceMeters
        if (stepAccum >= distanceTraveledMeters) {
          nextStep = step
          break
        }
      }
    }

    // Persist to Ride document
    ride.currentLat = currentLat
    ride.currentLng = currentLng
    ride.tripRoute!.remainingDistanceMeters = remainingDistanceMeters
    ride.tripRoute!.remainingDurationSeconds = remainingDurationSeconds
    ride.tripRoute!.progressPercent = progressPercent
    ride.tripRoute!.currentStopIndex = Math.max(0, activeStopIndex)

    await ride.save()

    // Persist vehicle telematics
    if (ride.vehicleId) {
      await VehicleModel.updateOne(
        { id: ride.vehicleId },
        {
          currentLat,
          currentLng,
          heading: heading || 0,
          speed: speed || 0,
          locationUpdatedAt: new Date(),
          status: 'ON_TRIP',
        }
      )
    }

    // Auto-reroute if confirmed off-route
    if (isOffRoute && ride.status === 'active') {
      await this.reroute(ride, currentLat, currentLng)
    }

    return {
      ride,
      progress: {
        percent: progressPercent,
        distanceTraveledMeters: Math.round(distanceTraveledMeters),
        remainingDistanceMeters,
        remainingDurationSeconds,
        etaString,
        isOffRoute,
        deviationMeters: Math.round(minDistanceMeters),
      },
      currentStop: activeStopIndex >= 0 ? stops[activeStopIndex] : null,
      nextManeuver: nextStep,
    }
  }

  /**
   * Recalculate route from current position through remaining stops to destination
   */
  async reroute(ride: IRide, currentLat: number, currentLng: number): Promise<ITripRoute> {
    console.log(`[RouteProgress] Rerouting ride ${ride.id} from [${currentLat}, ${currentLng}]...`)

    // Include all remaining active stops: unboarded pickups + uncompleted dropoffs
    const remainingStops = (ride.stops || [])
      .filter((s) => {
        if (s.type === 'PICKUP') return s.status !== 'BOARDED' && s.status !== 'COMPLETED'
        if (s.type === 'DROPOFF') return s.status !== 'COMPLETED'
        return false
      })
      .map((s) => [s.latitude, s.longitude] as [number, number])

    const waypoints: [number, number][] = [
      [currentLat, currentLng],
      ...remainingStops,
    ]

    // If no remaining stops, end at destination
    if (waypoints.length === 1) {
      waypoints.push([ride.destinationLat, ride.destinationLng])
    }

    const routeResult = await routingService.getRoute(waypoints)

    const updatedTripRoute: ITripRoute = {
      version: (ride.tripRoute?.version || 0) + 1,
      origin: { lat: currentLat, lng: currentLng, name: 'Current Position' },
      destination: { lat: ride.destinationLat, lng: ride.destinationLng, name: ride.destination },
      geometry: routeResult.geometry,
      distanceMeters: routeResult.distanceMeters,
      durationSeconds: routeResult.durationSeconds,
      remainingDistanceMeters: routeResult.distanceMeters,
      remainingDurationSeconds: routeResult.durationSeconds,
      progressPercent: 0,
      currentStopIndex: ride.tripRoute?.currentStopIndex || 0,
      status: 'NAVIGATING',
      steps: (routeResult.steps || []).map((s) => ({
        instruction: s.instruction,
        distanceMeters: s.distanceMeters,
        durationSeconds: s.durationSeconds,
        maneuverType: s.maneuverType,
        roadName: s.roadName,
      })),
    }

    ride.tripRoute = updatedTripRoute
    ride.routeCoordinates = routeResult.geometry
    ride.distanceKm = Number((routeResult.distanceMeters / 1000).toFixed(1))
    ride.hasDeviation = false
    await ride.save()

    realtimeService.broadcast('ROUTE_UPDATED', {
      rideId: ride.id,
      route: updatedTripRoute,
      action: 'REROUTED',
    })

    return updatedTripRoute
  }

  /**
   * Dynamically insert new passenger pickup & dropoff into route
   */
  async handlePassengerJoin(
    ride: IRide,
    studentId: string,
    studentName: string,
    pickup: string,
    pickupCoords?: { lat: number; lng: number },
    destination?: string,
    destinationCoords?: { lat: number; lng: number }
  ) {
    const lat = pickupCoords?.lat || 17.4934
    const lng = pickupCoords?.lng || 78.3995

    // Add to pickupPoints if not exists
    const existingP = ride.pickupPoints.find((p) => p.name.toLowerCase() === pickup.toLowerCase())
    if (!existingP) {
      ride.pickupPoints.push({
        id: `pp-${Date.now().toString().slice(-4)}`,
        name: pickup,
        lat,
        lng,
        estimatedPickupTime: '8:20 AM',
      })
    }

    // Clean up unbooked template placeholder stops (e.g. Railway Station) that have no passenger assigned
    if (ride.startLocation && ride.pickupPoints && ride.pickupPoints.length > 1) {
      ride.pickupPoints = ride.pickupPoints.filter((pp) => {
        const hasPax = (ride.passengers || []).some((p: any) => p.pickup?.toLowerCase() === pp.name.toLowerCase())
        const isStart = pp.name.toLowerCase() === ride.startLocation?.toLowerCase()
        const isNewPickup = pp.name.toLowerCase() === pickup.toLowerCase()
        return hasPax || isStart || isNewPickup
      })
    }

    // If destination provided, update ride destination if generic/campus or single passenger
    if (destination) {
      const isGenericCampus =
        !ride.destination ||
        ride.destination.toLowerCase().includes('campus main gate') ||
        ride.destination.toLowerCase().includes('sri indu campus') ||
        ride.passengers.length <= 1

      if (isGenericCampus || ride.destination.toLowerCase() === destination.toLowerCase()) {
        ride.destination = destination
        if (destinationCoords?.lat && destinationCoords?.lng) {
          ride.destinationLat = destinationCoords.lat
          ride.destinationLng = destinationCoords.lng
        }
        if (pickup && destination && pickup.trim().toLowerCase() !== destination.trim().toLowerCase()) {
          ride.routeName = `${pickup} → ${destination}`
        }
      }
    }

    // Ensure passenger record in ride has the passenger's destination
    const passengerItem = (ride.passengers || []).find((p: any) => p.studentId === studentId)
    if (passengerItem && destination) {
      passengerItem.destination = destination
    }

    // Rebuild stops and route
    await this.buildTripRoute(ride)

    ride.markModified('passengers')
    ride.markModified('pickupPoints')
    ride.markModified('stops')
    if (ride.tripRoute) ride.markModified('tripRoute')
    await ride.save()

    realtimeService.broadcast('ROUTE_UPDATED', {
      rideId: ride.id,
      route: ride.tripRoute,
      stops: ride.stops,
      action: 'PASSENGER_JOINED',
    })
    realtimeService.broadcast('RIDE_UPDATED', { ride })
  }

  /**
   * Complete individual passenger dropoff
   */
  async handlePassengerDrop(rideId: string, studentId: string): Promise<IRide> {
    const ride = await RideModel.findOne({ id: rideId })
    if (!ride) throw new Error('Ride not found')

    // Mark passenger status as dropped in ride
    const passenger = (ride.passengers || []).find((p: any) => p.studentId === studentId)
    if (passenger) {
      passenger.status = 'dropped'
    }

    // Mark corresponding dropoff stop as COMPLETED
    if (ride.stops) {
      const dropoffStop = ride.stops.find(
        (s: any) => s.type === 'DROPOFF' && (s.studentId === studentId || s.name === passenger?.destination)
      )
      if (dropoffStop) {
        dropoffStop.status = 'COMPLETED'
        dropoffStop.actualArrival = new Date()
      }
    }

    // Update MongoDB Booking
    await BookingModel.updateMany(
      { rideId, studentId, status: { $ne: 'cancelled' } },
      { status: 'completed', completedAt: new Date() }
    )

    // Check if ALL passengers in this ride are now dropped
    const allDropped =
      (ride.passengers || []).length > 0 &&
      ride.passengers.every((p: any) => p.status === 'dropped')

    if (allDropped) {
      ride.status = 'completed'
      if (ride.tripRoute) {
        ride.tripRoute.status = 'COMPLETED'
        ride.tripRoute.progressPercent = 100
        ride.tripRoute.remainingDistanceMeters = 0
        ride.tripRoute.remainingDurationSeconds = 0
      }
      if (ride.stops) {
        ride.stops.forEach((s: any) => {
          s.status = 'COMPLETED'
        })
      }
      if (ride.vehicleId) {
        await VehicleModel.updateOne({ id: ride.vehicleId }, { status: 'AVAILABLE' })
      }
      realtimeService.broadcast('RIDE_COMPLETED', { rideId, ride })
    } else {
      // Re-route remaining stops if active
      if (ride.status === 'active' && ride.currentLat && ride.currentLng) {
        try {
          await this.reroute(ride, ride.currentLat, ride.currentLng)
        } catch (err: any) {
          console.warn(`[RouteProgress] Reroute after passenger drop warning: ${err.message}`)
        }
      }
    }

    ride.markModified('passengers')
    ride.markModified('stops')
    if (ride.tripRoute) ride.markModified('tripRoute')
    await ride.save()

    const driverUser = await UserModel.findOne({ id: ride.driverId })

    // Central Notification: Passenger Dropped
    await notificationService.notifyRideEvent('PASSENGER_DROPPED', {
      rideId,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      studentId,
      studentName: passenger?.name || 'Student',
      destination: passenger?.destination || ride.destination,
    }).catch((e) => console.warn('[RouteProgress] Passenger drop notification warning:', e.message))

    if (allDropped) {
      const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
      await notificationService.notifyRideEvent('TRIP_COMPLETED', {
        rideId,
        routeName: ride.routeName,
        driverId: ride.driverId,
        driverName: driverUser?.name || 'Driver',
        vehicleId: ride.vehicleId,
        passengerIds,
      }).catch((e) => console.warn('[RouteProgress] Trip complete notification warning:', e.message))
    }

    realtimeService.broadcast('PASSENGER_DROPPED', { rideId, studentId })
    realtimeService.broadcast('RIDE_UPDATED', { ride })
    realtimeService.broadcast('BOOKING_UPDATED', { rideId, studentId, status: 'completed' })

    return ride
  }

  /**
   * Dynamically remove passenger pickup stop on cancellation (Section 31)
   */
  async handlePassengerCancel(ride: IRide, studentId: string) {
    // Remove passenger
    const cancelledPassenger = ride.passengers.find((p) => p.studentId === studentId)
    ride.passengers = ride.passengers.filter((p) => p.studentId !== studentId)

    if (cancelledPassenger) {
      // Check if other passengers share this pickup
      const otherSamePickup = ride.passengers.some((p) => p.pickup === cancelledPassenger.pickup)
      if (!otherSamePickup) {
        ride.pickupPoints = ride.pickupPoints.filter((pp) => pp.name !== cancelledPassenger.pickup)
      }
    }

    // Rebuild stops and route
    await this.buildTripRoute(ride)

    realtimeService.broadcast('ROUTE_UPDATED', {
      rideId: ride.id,
      route: ride.tripRoute,
      stops: ride.stops,
      action: 'PASSENGER_CANCELLED',
    })
  }
}

export const routeProgressService = new RouteProgressService()
