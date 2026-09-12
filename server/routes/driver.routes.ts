import { FastifyPluginAsync } from 'fastify'
import { RideModel } from '../models/Ride.js'
import { VehicleModel } from '../models/Vehicle.js'
import { BookingModel } from '../models/Booking.js'
import { UserModel } from '../models/User.js'
import { VehicleLocationHistoryModel } from '../models/VehicleLocationHistory.js'
import { realtimeService } from '../services/realtimeService.js'
import { notificationService } from '../services/notificationService.js'
import { routeProgressService } from '../services/routeProgressService.js'
import { recoveryService } from '../services/recoveryService.js'
import { requireRoles } from '../middleware/auth.js'

export const driverRoutes: FastifyPluginAsync = async (fastify) => {
  // Enforce Driver / Dispatcher / Admin RBAC on driver endpoints
  fastify.addHook('preHandler', requireRoles(['DRIVER', 'DISPATCHER', 'ADMIN']))

  // Get driver's assigned rides
  fastify.get('/rides', async (request) => {
    const driverId = request.user?.id || (request.headers['x-driver-id'] as string) || 'd1'
    const query = request.query as { date?: string; status?: string; all?: string }
    // Only include demo fallback IDs when the driver has no real authenticated ID
    const orConditions: any[] = [{ driverId }]
    if (!driverId || driverId === 'd1' || driverId === 'driver-1') {
      orConditions.push({ driverId: 'd1' }, { driverId: 'driver-1' })
    }
    const filter: any = { $or: orConditions }
    if (query.date && query.all !== 'true') {
      filter.date = query.date
    }
    if (query.status && query.status !== 'all') {
      filter.status = query.status
    } else if (!query.status) {
      // Default: exclude completed/cancelled — driver only needs active/pending rides
      filter.status = { $nin: ['completed', 'cancelled'] }
    }
    const rides = await RideModel.find(filter).sort({ createdAt: -1 })
    const driverIds = [...new Set(rides.map((r) => r.driverId).filter(Boolean))]
    const vehicleIds = [...new Set(rides.map((r) => r.vehicleId).filter(Boolean))]
    const [drivers, vehicles] = await Promise.all([
      UserModel.find({ id: { $in: driverIds } }),
      VehicleModel.find({ id: { $in: vehicleIds } }),
    ])
    const driverMap = new Map(drivers.map((d) => [d.id, d]))
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]))

    const hydrated = rides.map((r) => {
      const rObj = r.toObject ? r.toObject() : { ...r }
      const driver = driverMap.get(r.driverId)
      const vehicle = vehicleMap.get(r.vehicleId)
      return {
        ...rObj,
        driverName: driver?.name || r.driverName || 'Rahul Kumar',
        driverPhone: driver?.phone || r.driverPhone || '+91 99887 76655',
        driverRating: driver?.rating || r.driverRating || 4.8,
        driverAvatar: driver?.avatar || (driver?.name ? driver.name.slice(0, 2).toUpperCase() : 'RK'),
        vehicleName: vehicle?.name || r.vehicleName || 'Campus Shuttle Bus 01 (V1)',
        vehiclePlate: vehicle?.registrationNumber || r.vehiclePlate || 'TS 09 AB 1234',
      }
    })
    return { success: true, data: hydrated }
  })

  // Get current active trip for driver
  fastify.get('/current-trip', async (request, reply) => {
    const driverId = request.user?.id || (request.headers['x-driver-id'] as string) || (request.query as any)?.driverId || 'd1'
    const orConditions: any[] = [{ driverId }]
    if (!driverId || driverId === 'd1' || driverId === 'driver-1') {
      orConditions.push({ driverId: 'd1' }, { driverId: 'driver-1' })
    }

    const trip = await RideModel.findOne({
      $or: orConditions,
      status: { $in: ['active', 'boarding', 'waiting'] },
    }).sort({ createdAt: -1 })

    if (!trip) {
      return { success: true, data: null }
    }

    const [driver, vehicle, bookings] = await Promise.all([
      UserModel.findOne({ id: trip.driverId }),
      VehicleModel.findOne({ id: trip.vehicleId }),
      BookingModel.find({ rideId: trip.id, status: { $ne: 'cancelled' } }),
    ])

    const tObj = trip.toObject ? trip.toObject() : { ...trip }
    return {
      success: true,
      data: {
        ...tObj,
        driverName: driver?.name || trip.driverName || 'Rahul Kumar',
        driverPhone: driver?.phone || trip.driverPhone || '+91 99887 76655',
        driverRating: driver?.rating || trip.driverRating || 4.8,
        vehicleName: vehicle?.name || trip.vehicleName || 'Campus Shuttle Bus 01 (V1)',
        vehiclePlate: vehicle?.registrationNumber || trip.vehiclePlate || 'TS 09 AB 1234',
        bookings,
      },
    }
  })

  // Accept a ride request
  fastify.post('/rides/:id/accept', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    ride.status = 'boarding'
    // Build initial OSRM trip route
    await routeProgressService.buildTripRoute(ride)
    await ride.save()

    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)

    await notificationService.notifyRideEvent('DRIVER_ACCEPTED', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      passengerIds,
    })

    realtimeService.broadcast('RIDE_UPDATED', { ride, event: 'DRIVER_ACCEPTED' })
    return { success: true, data: ride }
  })

  // Start trip
  fastify.post('/rides/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body as any) || {}
    const { startLat, startLng, startLocation } = body

    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    ride.status = 'active'
    if (typeof startLat === 'number' && typeof startLng === 'number') {
      ride.currentLat = startLat
      ride.currentLng = startLng
      ride.startLocationLat = startLat
      ride.startLocationLng = startLng
      if (startLocation) {
        ride.startLocation = startLocation
      }
    }

    if (startLocation && typeof startLat === 'number' && typeof startLng === 'number') {
      const firstPP = ride.pickupPoints?.[0]
      const hasPaxAtFirst = firstPP && (ride.passengers || []).some((p: any) => p.pickup?.toLowerCase() === firstPP.name?.toLowerCase())
      if (!hasPaxAtFirst) {
        if (!ride.pickupPoints || ride.pickupPoints.length === 0) {
          ride.pickupPoints = [{
            id: `pp-start-${ride.id}`,
            name: startLocation,
            lat: startLat,
            lng: startLng,
            estimatedPickupTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }]
        } else {
          ride.pickupPoints[0] = {
            id: ride.pickupPoints[0].id || `pp-start-${ride.id}`,
            name: startLocation,
            lat: startLat,
            lng: startLng,
            estimatedPickupTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
        }
      }
    }

    await routeProgressService.buildTripRoute(ride, startLat, startLng, startLocation)
    if (ride.tripRoute) {
      ride.tripRoute.status = 'NAVIGATING'
    }
    await ride.save()

    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)

    await notificationService.notifyRideEvent('TRIP_STARTED', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      vehicleId: ride.vehicleId,
      passengerIds,
    })

    realtimeService.broadcast('RIDE_STARTED', { rideId: id, ride })
    realtimeService.broadcast('RIDE_UPDATED', { ride })
    if (ride.tripRoute) {
      realtimeService.broadcast('ROUTE_UPDATED', { rideId: id, route: ride.tripRoute, stops: ride.stops })
    }
    return { success: true, data: ride }
  })

  // Update driver GPS telematics & road-snapped route progress (Sections 8, 9, 10, 12, 33)
  fastify.post('/location', async (request, reply) => {
    const body = request.body as {
      rideId: string
      vehicleId?: string
      lat: number
      lng: number
      heading?: number
      speed?: number
      accuracy?: number
      timestamp?: string
    }

    if (!body.rideId || body.lat === undefined || body.lng === undefined) {
      return reply.status(400).send({ success: false, error: { message: 'Missing rideId, lat, or lng' } })
    }

    try {
      const result = await routeProgressService.updateProgress(
        body.rideId,
        body.lat,
        body.lng,
        body.heading,
        body.speed
      )

      // Telematics history logging (Section 79)
      const driverId = (request.headers['x-driver-id'] as string) || result.ride.driverId
      VehicleLocationHistoryModel.create({
        id: `vlh-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
        vehicleId: result.ride.vehicleId || 'v1',
        rideId: body.rideId,
        driverId,
        latitude: body.lat,
        longitude: body.lng,
        heading: body.heading || 0,
        speed: body.speed || 0,
        accuracy: body.accuracy || 5,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      }).catch((e: any) => console.warn('[Telematics] History save warning:', e.message))

      // Broadcast unified telematics event (Sections 12, 34)
      realtimeService.broadcast('VEHICLE_LOCATION_UPDATED', {
        rideId: body.rideId,
        vehicleId: result.ride.vehicleId,
        latitude: body.lat,
        longitude: body.lng,
        heading: body.heading || 0,
        speed: body.speed || 0,
        progress: result.progress,
        currentStop: result.currentStop,
        nextManeuver: result.nextManeuver,
        timestamp: body.timestamp || new Date().toISOString(),
      })

      // Backwards compatibility for older listeners
      realtimeService.broadcast('DRIVER_LOCATION_UPDATED', {
        rideId: body.rideId,
        lat: body.lat,
        lng: body.lng,
        heading: body.heading || 0,
      })

      return {
        success: true,
        data: {
          rideId: body.rideId,
          lat: body.lat,
          lng: body.lng,
          progress: result.progress,
          currentStop: result.currentStop,
          nextManeuver: result.nextManeuver,
        },
      }
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { message: err.message } })
    }
  })

  // Mark specific stop as ARRIVED (Sections 24, 74)
  fastify.post('/rides/:id/stops/:stopId/arrived', async (request, reply) => {
    const { id, stopId } = request.params as { id: string; stopId: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    const stop = (ride.stops || []).find((s: any) => s.id === stopId)
    if (!stop) {
      return reply.status(404).send({ success: false, error: { message: 'Stop not found' } })
    }

    stop.status = 'ARRIVED'
    await ride.save()

    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const vehicle = await VehicleModel.findOne({ id: ride.vehicleId })
    const matchedPassenger = (ride.passengers || []).find((p: any) => p.studentId === stop.studentId || p.pickup === stop.name || p.pickupStopId === stop.id) || (ride.passengers || [])[0]
    const targetStudentId = stop.studentId || matchedPassenger?.studentId

    await notificationService.notifyRideEvent('DRIVER_REACHED_PICKUP', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      vehicleId: ride.vehicleId,
      vehicleName: vehicle?.name,
      vehiclePlate: vehicle?.registrationNumber,
      stopId: stop.id,
      stopName: stop.name,
      studentId: targetStudentId,
    })

    realtimeService.broadcast('DRIVER_ARRIVED', { rideId: id, stopId, stopName: stop.name })
    realtimeService.broadcast('STOP_UPDATED', { rideId: id, stop })
    realtimeService.broadcast('RIDE_UPDATED', { ride })

    return { success: true, data: { ride, stop } }
  })

  // Confirm passenger boarding at a stop (Sections 25, 74)
  fastify.post('/rides/:id/stops/:stopId/boarded', async (request, reply) => {
    const { id, stopId } = request.params as { id: string; stopId: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    const stop = (ride.stops || []).find((s: any) => s.id === stopId)
    if (!stop) {
      return reply.status(404).send({ success: false, error: { message: 'Stop not found' } })
    }

    stop.status = 'BOARDED'

    // Update corresponding passenger in ride.passengers
    const matchedPassenger = (ride.passengers || []).find((item: any) => item.studentId === stop.studentId || item.pickup === stop.name || item.pickupStopId === stop.id) || (ride.passengers || [])[0]
    let boardedPassengerStudentId = stop.studentId || matchedPassenger?.studentId
    let boardedPassengerName = matchedPassenger?.name || 'Passenger'
    if (matchedPassenger) {
      matchedPassenger.status = 'boarded'
    }

    // Advance currentStopIndex
    if (ride.tripRoute) {
      const nextUpcomingIndex = (ride.stops || []).findIndex((s: any) => s.status === 'UPCOMING' || s.status === 'ARRIVING' || s.status === 'ARRIVED')
      if (nextUpcomingIndex >= 0) {
        ride.tripRoute.currentStopIndex = nextUpcomingIndex
      }
    }

    await ride.save()

    const driverUser = await UserModel.findOne({ id: ride.driverId })

    await notificationService.notifyRideEvent('PASSENGER_BOARDED', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      studentId: boardedPassengerStudentId,
      studentName: boardedPassengerName,
      stopId: stop.id,
      stopName: stop.name,
    })

    realtimeService.broadcast('PASSENGER_BOARDED', { rideId: id, stopId, stopName: stop.name })
    realtimeService.broadcast('STOP_UPDATED', { rideId: id, stop })
    realtimeService.broadcast('RIDE_UPDATED', { ride })

    return { success: true, data: { ride, stop } }
  })

  // Complete Ride (Section 49)
  fastify.post('/rides/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    ride.status = 'completed'
    if (ride.tripRoute) {
      ride.tripRoute.status = 'COMPLETED'
      ride.tripRoute.progressPercent = 100
      ride.tripRoute.remainingDistanceMeters = 0
      ride.tripRoute.remainingDurationSeconds = 0
    }
    for (const s of ride.stops || []) {
      s.status = 'COMPLETED'
    }
    for (const p of ride.passengers || []) {
      p.status = 'dropped'
    }

    // Sync any bookings for this ride that might not be in ride.passengers
    const relatedBookings = await BookingModel.find({
      rideId: id,
      status: { $ne: 'cancelled' },
    })
    for (const b of relatedBookings) {
      const existing = (ride.passengers || []).find((p: any) => p.studentId === b.studentId)
      if (!existing) {
        const studentUser = await UserModel.findOne({ id: b.studentId })
        ride.passengers.push({
          studentId: b.studentId,
          name: studentUser?.name || 'Student',
          pickup: b.pickup,
          status: 'dropped',
          seatNo: (b as any).seatNo || ride.passengers.length + 1,
        })
      }
    }

    ride.markModified('passengers')
    ride.markModified('stops')
    ride.markModified('tripRoute')
    await ride.save()

    // Free vehicle
    if (ride.vehicleId) {
      await VehicleModel.updateOne({ id: ride.vehicleId }, { status: 'AVAILABLE' })
    }

    // Update all bookings on this ride
    await BookingModel.updateMany(
      { rideId: id, status: { $ne: 'cancelled' } },
      { status: 'completed', completedAt: new Date() }
    )

    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)

    await notificationService.notifyRideEvent('TRIP_COMPLETED', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      vehicleId: ride.vehicleId,
      passengerIds,
    })

    realtimeService.broadcast('RIDE_COMPLETED', { rideId: id, ride })
    realtimeService.broadcast('RIDE_UPDATED', { ride })
    realtimeService.broadcast('BOOKING_UPDATED', { rideId: id, status: 'completed' })

    return { success: true, data: ride }
  })

  // Passenger boarding status endpoint
  fastify.post('/passengers', async (request, reply) => {
    const { rideId, studentId, status } = request.body as {
      rideId: string
      studentId: string
      status: 'waiting' | 'boarded' | 'dropped' | 'no_show'
    }

    const ride = await RideModel.findOne({ id: rideId })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    if (status === 'dropped') {
      const updatedRide = await routeProgressService.handlePassengerDrop(rideId, studentId)
      return { success: true, data: updatedRide }
    }

    if (status === 'no_show') {
      const p = (ride.passengers || []).find((item: any) => item.studentId === studentId)
      if (p) {
        p.status = 'no_show' as any
      }
      const stop = (ride.stops || []).find((s: any) => s.studentId === studentId || (p && s.name === p.pickup))
      if (stop) {
        stop.status = 'COMPLETED'
      }
      await ride.save()

      await BookingModel.updateMany(
        { rideId, studentId, status: { $ne: 'cancelled' } },
        { status: 'cancelled' }
      )

      const driverUser = await UserModel.findOne({ id: ride.driverId })
      await notificationService.notifyRideEvent('PASSENGER_NO_SHOW', {
        rideId,
        routeName: ride.routeName,
        driverId: ride.driverId,
        driverName: driverUser?.name || 'Driver',
        studentId,
        studentName: p?.name || 'Passenger',
        pickup: p?.pickup,
      })

      realtimeService.broadcast('RIDE_UPDATED', { ride })
      realtimeService.broadcast('BOOKING_UPDATED', { rideId, studentId, status: 'cancelled' })
      return { success: true, data: ride }
    }

    let p = (ride.passengers || []).find((item: any) => item.studentId === studentId)
    if (p) {
      p.status = status
    } else {
      const b = await BookingModel.findOne({ rideId, studentId })
      ride.passengers.push({
        studentId,
        name: (b as any)?.passengerName || 'Student',
        pickup: (b as any)?.pickup || 'Campus Stop',
        status,
        seatNo: (b as any)?.seatNo || ride.passengers.length + 1,
      })
      p = ride.passengers[ride.passengers.length - 1]
    }

    // Update matching pickup stop if exists
    const stop = (ride.stops || []).find((s: any) => s.studentId === studentId || (p && s.name === p.pickup))
    if (stop) {
      stop.status = status === 'boarded' ? 'BOARDED' : 'UPCOMING'
    }

    ride.markModified('passengers')
    ride.markModified('stops')
    await ride.save()

    // Also update BookingModel in MongoDB
    const bookingStatus = status === 'boarded' ? 'in_transit' : 'confirmed'
    await BookingModel.updateMany(
      { rideId, studentId, status: { $ne: 'cancelled' } },
      { status: bookingStatus }
    )

    const driverUser = await UserModel.findOne({ id: ride.driverId })

    if (status === 'boarded') {
      await notificationService.notifyRideEvent('PASSENGER_BOARDED', {
        rideId,
        routeName: ride.routeName,
        driverId: ride.driverId,
        driverName: driverUser?.name || 'Driver',
        studentId,
        studentName: p?.name || 'Passenger',
        pickup: p?.pickup,
      })
    }

    realtimeService.broadcast('RIDE_UPDATED', { ride })
    realtimeService.broadcast('BOOKING_UPDATED', { rideId, studentId, status: bookingStatus })
    realtimeService.broadcast('PASSENGER_BOARDED', { rideId, studentId, status })

    return { success: true, data: ride }
  })

  // Driver reports vehicle breakdown (automated ride recovery)
  fastify.post('/breakdown', async (request, reply) => {
    const driverId = request.user?.id || (request.headers['x-driver-id'] as string) || 'd1'
    const body = (request.body as any) || {}

    try {
      const result = await recoveryService.reportBreakdown({
        vehicleId: body.vehicleId,
        driverId,
        location: body.location,
        reason: body.reason || 'Driver reported vehicle breakdown / malfunction',
        trigger: 'DRIVER_REPORTED',
      })

      return reply.status(200).send({
        success: true,
        data: result,
      })
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { message: err.message || 'Breakdown reporting failed' },
      })
    }
  })
}


