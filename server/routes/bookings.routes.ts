import { FastifyPluginAsync } from 'fastify'
import { BookingModel } from '../models/Booking.js'
import { RideModel } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { VehicleModel } from '../models/Vehicle.js'
import { tripGroupingService } from '../services/tripGroupingService.js'
import { routeProgressService } from '../services/routeProgressService.js'
import { pricingEngine } from '../services/pricingEngine.js'
import { routingService } from '../services/routingService.js'
import { notificationService } from '../services/notificationService.js'
import { realtimeService } from '../services/realtimeService.js'

export const bookingRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/bookings — Unified booking entry point with automated route compatibility grouping
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      studentId?: string
      pickup: string
      pickupName?: string
      pickupAddress?: string
      pickupCoords?: { lat: number; lng: number } | [number, number]
      destination: string
      destinationName?: string
      destinationAddress?: string
      destinationCoords?: { lat: number; lng: number } | [number, number]
      time?: string
      seats?: number
      genderPreference?: string
    }

    const studentId = body.studentId || (request.headers['x-user-id'] as string) || 's1'
    const student = await UserModel.findOne({ id: studentId })
    const studentName = student?.name || 'Student'
    const studentGender = student?.gender || 'Other'

    const pName = (body.pickupName || body.pickup || '').trim()
    const dName = (body.destinationName || body.destination || '').trim()

    if (!pName || !dName) {
      return reply.status(400).send({ success: false, error: { message: 'Pickup and destination are required.' } })
    }
    if (pName.toLowerCase() === dName.toLowerCase()) {
      return reply.status(400).send({ success: false, error: { message: 'Pickup and destination cannot be identical.' } })
    }

    // Extract coordinates safely
    let pLat = 17.3616
    let pLng = 78.4747
    if (body.pickupCoords) {
      if (Array.isArray(body.pickupCoords) && body.pickupCoords.length >= 2) {
        pLat = body.pickupCoords[0]
        pLng = body.pickupCoords[1]
      } else if (typeof (body.pickupCoords as any).lat === 'number') {
        pLat = (body.pickupCoords as any).lat
        pLng = (body.pickupCoords as any).lng
      }
    }

    let dLat = 17.2063
    let dLng = 78.6015
    if (body.destinationCoords) {
      if (Array.isArray(body.destinationCoords) && body.destinationCoords.length >= 2) {
        dLat = body.destinationCoords[0]
        dLng = body.destinationCoords[1]
      } else if (typeof (body.destinationCoords as any).lat === 'number') {
        dLat = (body.destinationCoords as any).lat
        dLng = (body.destinationCoords as any).lng
      }
    }

    const requestedSeats = body.seats || 1
    const departureTime = body.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const genderPref = body.genderPreference || 'ANYONE'

    // Female-only strict verification
    if (genderPref === 'FEMALE_ONLY' && studentGender === 'Male') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PREFERENCE', message: 'Female-only commute is reserved for female passengers.' },
      })
    }

    // --- Automated Route Compatibility & Trip Grouping Decision ---
    const placement = await tripGroupingService.evaluateBookingPlacement({
      studentId,
      studentName,
      pickupName: pName,
      pickupAddress: body.pickupAddress,
      pickupLat: pLat,
      pickupLng: pLng,
      destinationName: dName,
      destinationAddress: body.destinationAddress,
      destinationLat: dLat,
      destinationLng: dLng,
      requestedTime: departureTime,
      seats: requestedSeats,
      genderPreference: genderPref,
    })

    if (placement.decision === 'JOIN_EXISTING' && placement.targetTrip) {
      // 1. Join Existing Compatible Trip
      const targetTrip = placement.targetTrip
      const nextSeatNo = (targetTrip.bookedSeats || 0) + 1
      const isFemaleOnly = genderPref === 'FEMALE_ONLY' || targetTrip.isFemaleOnly

      const newPassenger = {
        studentId,
        name: studentName,
        pickup: pName,
        destination: dName,
        status: 'waiting' as const,
        seatNo: nextSeatNo,
        gender: studentGender,
        genderPreference: genderPref,
      }

      // Atomic capacity update
      const updatedTrip = await RideModel.findOneAndUpdate(
        {
          id: targetTrip.id,
          bookedSeats: { $lte: targetTrip.capacity - requestedSeats },
          status: { $nin: ['full', 'completed', 'cancelled'] },
        },
        {
          $inc: { bookedSeats: requestedSeats },
          $push: { passengers: newPassenger },
          ...(isFemaleOnly ? { isFemaleOnly: true, genderPreference: 'FEMALE_ONLY' } : {}),
        },
        { new: true }
      )

      if (!updatedTrip) {
        return reply.status(409).send({
          success: false,
          error: { code: 'TRIP_FULL_CONCURRENT', message: 'Trip capacity was claimed concurrently. Retrying placement.' },
        })
      }

      // Rebuild trip route & stops with OSRM
      await routeProgressService.buildTripRoute(updatedTrip)

      // Calculate dynamic locked passenger fare
      const fareResult = await pricingEngine.calculatePassengerFare(
        {
          studentId,
          studentName,
          pickupName: pName,
          pickupLat: pLat,
          pickupLng: pLng,
          destinationName: dName,
          destinationLat: dLat,
          destinationLng: dLng,
          seats: requestedSeats,
        },
        updatedTrip,
        { status: 'CONFIRMED', trigger: 'PASSENGER_JOINED' }
      )

      const bookingId = `b-${Date.now().toString().slice(-6)}`
      const booking = await BookingModel.create({
        id: bookingId,
        studentId,
        studentName,
        rideId: updatedTrip.id,
        pickup: pName,
        pickupName: pName,
        pickupAddress: body.pickupAddress,
        pickupLat: pLat,
        pickupLng: pLng,
        destination: dName,
        destinationName: dName,
        destinationAddress: body.destinationAddress,
        destinationLat: dLat,
        destinationLng: dLng,
        seats: requestedSeats,
        fare: fareResult.finalFare,
        originalFare: fareResult.originalFare,
        fareId: fareResult.fareId,
        isPriceLocked: true,
        seatNo: nextSeatNo,
        status: 'confirmed',
        matchScore: placement.score,
        bookedAt: new Date(),
      })

      // Notify and broadcast
      await notificationService.notifyRideEvent('BOOKING_CONFIRMED', {
        studentId,
        studentName,
        rideId: updatedTrip.id,
        routeName: updatedTrip.routeName,
        fare: fareResult.finalFare,
        pickup: pName,
        destination: dName,
        metadata: { bookingId, matchingType: 'JOINED_EXISTING_TRIP' },
      })

      realtimeService.broadcast('PASSENGER_JOINED_TRIP', {
        tripId: updatedTrip.id,
        bookingId,
        passenger: newPassenger,
        bookedSeats: updatedTrip.bookedSeats,
      })
      realtimeService.broadcast('TRIP_ROUTE_UPDATED', {
        tripId: updatedTrip.id,
        trip: updatedTrip,
      })

      return reply.send({
        success: true,
        data: {
          booking,
          trip: updatedTrip,
          matchingType: 'JOINED_EXISTING_TRIP',
          driver: {
            id: updatedTrip.driverId,
            name: updatedTrip.driverName,
            phone: updatedTrip.driverPhone,
            rating: updatedTrip.driverRating,
          },
          vehicle: {
            id: updatedTrip.vehicleId,
            name: updatedTrip.vehicleName,
            registration: updatedTrip.vehiclePlate,
          },
          metrics: {
            score: placement.score,
            routeOverlapPercent: placement.routeOverlapPercent,
            detourPercent: placement.detourPercent,
            additionalDistanceKm: placement.additionalDistanceKm,
            additionalDurationMinutes: placement.additionalDurationMinutes,
          },
        },
      })
    } else if (placement.decision === 'CREATE_NEW' && placement.assignedDriver && placement.assignedVehicle) {
      // 2. Create New Trip with Distinct Available Driver + Vehicle
      const assignedDriver = placement.assignedDriver
      const assignedVehicle = placement.assignedVehicle
      const tripId = `trip-${Date.now().toString().slice(-6)}`
      const isFemaleOnly = genderPref === 'FEMALE_ONLY'

      // Initial route coordinates from OSRM
      let routeCoords: [number, number][] = []
      try {
        const osrmRoute = await routingService.getRoute([
          [pLat, pLng],
          [dLat, dLng],
        ])
        routeCoords = osrmRoute.geometry
      } catch {
        routeCoords = [
          [pLat, pLng],
          [dLat, dLng],
        ]
      }

      const newTrip = await RideModel.create({
        id: tripId,
        routeName: `Campus Trip #${tripId.slice(-4)} (${pName.split(',')[0]} → ${dName.split(',')[0]})`,
        driverId: assignedDriver.id,
        driverName: assignedDriver.name,
        driverPhone: assignedDriver.phone,
        driverRating: assignedDriver.rating || 4.8,
        driverAvatar: assignedDriver.avatar || (assignedDriver.name ? assignedDriver.name.slice(0, 2).toUpperCase() : 'DR'),
        vehicleId: assignedVehicle.id,
        vehicleName: assignedVehicle.name,
        vehiclePlate: assignedVehicle.registrationNumber || 'TS 09 AB 1234',
        startLocation: pName,
        startLocationLat: pLat,
        startLocationLng: pLng,
        currentLat: pLat,
        currentLng: pLng,
        destination: dName,
        destinationLat: dLat,
        destinationLng: dLng,
        departureTime,
        estimatedArrival: '',
        capacity: assignedVehicle.capacity || 6,
        bookedSeats: requestedSeats,
        passengers: [
          {
            studentId,
            name: studentName,
            pickup: pName,
            destination: dName,
            status: 'waiting',
            seatNo: 1,
            gender: studentGender,
            genderPreference: genderPref,
          },
        ],
        status: 'waiting',
        fare: 25,
        isFemaleOnly,
        genderPreference: genderPref,
        routeCoordinates: routeCoords,
        date: 'today',
      })

      // Build initial TripRoute & stops
      await routeProgressService.buildTripRoute(newTrip)

      // Calculate fare
      const fareResult = await pricingEngine.calculatePassengerFare(
        {
          studentId,
          studentName,
          pickupName: pName,
          pickupLat: pLat,
          pickupLng: pLng,
          destinationName: dName,
          destinationLat: dLat,
          destinationLng: dLng,
          seats: requestedSeats,
        },
        newTrip,
        { status: 'CONFIRMED', trigger: 'TRIP_CREATED' }
      )

      const bookingId = `b-${Date.now().toString().slice(-6)}`
      const booking = await BookingModel.create({
        id: bookingId,
        studentId,
        studentName,
        rideId: newTrip.id,
        pickup: pName,
        pickupName: pName,
        pickupAddress: body.pickupAddress,
        pickupLat: pLat,
        pickupLng: pLng,
        destination: dName,
        destinationName: dName,
        destinationAddress: body.destinationAddress,
        destinationLat: dLat,
        destinationLng: dLng,
        seats: requestedSeats,
        fare: fareResult.finalFare,
        originalFare: fareResult.originalFare,
        fareId: fareResult.fareId,
        isPriceLocked: true,
        seatNo: 1,
        status: 'confirmed',
        bookedAt: new Date(),
      })

      // Update vehicle assignment in database
      await VehicleModel.findOneAndUpdate(
        { id: assignedVehicle.id },
        { status: 'ON_TRIP', currentRideId: newTrip.id }
      )

      // Central Notification & Realtime Broadcasts
      await notificationService.notifyRideEvent('TRIP_CREATED', {
        rideId: newTrip.id,
        routeName: newTrip.routeName,
        driverId: assignedDriver.id,
        driverName: assignedDriver.name,
        vehicleId: assignedVehicle.id,
        passengerIds: [studentId],
      })

      realtimeService.broadcast('TRIP_CREATED', { trip: newTrip })
      realtimeService.broadcast('DRIVER_ASSIGNED', {
        tripId: newTrip.id,
        driverId: assignedDriver.id,
        driverName: assignedDriver.name,
      })
      realtimeService.broadcast('VEHICLE_ASSIGNED', {
        tripId: newTrip.id,
        vehicleId: assignedVehicle.id,
        vehicleName: assignedVehicle.name,
      })

      return reply.send({
        success: true,
        data: {
          booking,
          trip: newTrip,
          matchingType: 'NEW_TRIP',
          driver: {
            id: assignedDriver.id,
            name: assignedDriver.name,
            phone: assignedDriver.phone,
            rating: assignedDriver.rating,
          },
          vehicle: {
            id: assignedVehicle.id,
            name: assignedVehicle.name,
            registration: assignedVehicle.registrationNumber,
          },
        },
      })
    } else {
      // 3. Queue Pending Booking
      const bookingId = `b-${Date.now().toString().slice(-6)}`
      const booking = await BookingModel.create({
        id: bookingId,
        studentId,
        studentName,
        rideId: 'unassigned',
        pickup: pName,
        pickupName: pName,
        pickupAddress: body.pickupAddress,
        pickupLat: pLat,
        pickupLng: pLng,
        destination: dName,
        destinationName: dName,
        destinationAddress: body.destinationAddress,
        destinationLat: dLat,
        destinationLng: dLng,
        seats: requestedSeats,
        fare: 25,
        isPriceLocked: false,
        seatNo: 1,
        status: 'pending',
        bookedAt: new Date(),
      })

      realtimeService.broadcast('BOOKING_PENDING', { booking })

      return reply.send({
        success: true,
        data: {
          booking,
          matchingType: 'QUEUED_FOR_DISPATCH',
          message: 'Fleet vehicles currently at capacity. Booking queued for immediate driver assignment.',
        },
      })
    }
  })

  // GET /api/bookings — List bookings with optional query filters
  fastify.get('/', async (request) => {
    const query = request.query as { studentId?: string; rideId?: string; status?: string }
    const filter: any = {}
    if (query.studentId) filter.studentId = query.studentId
    if (query.rideId) filter.rideId = query.rideId
    if (query.status && query.status !== 'all') filter.status = query.status

    const bookings = await BookingModel.find(filter).sort({ createdAt: -1 })
    return { success: true, data: bookings }
  })

  // GET /api/bookings/:id — Retrieve single booking with full trip, driver, and vehicle metadata
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const booking = await BookingModel.findOne({ id })
    if (!booking) {
      return reply.status(404).send({ success: false, error: { message: 'Booking not found' } })
    }

    let trip: any = null
    let driver: any = null
    let vehicle: any = null

    if (booking.rideId && booking.rideId !== 'unassigned') {
      trip = await RideModel.findOne({ id: booking.rideId })
      if (trip) {
        const [dUser, vDoc] = await Promise.all([
          UserModel.findOne({ id: trip.driverId }),
          VehicleModel.findOne({ id: trip.vehicleId }),
        ])
        driver = dUser ? { id: dUser.id, name: dUser.name, phone: dUser.phone, rating: dUser.rating } : null
        vehicle = vDoc ? { id: vDoc.id, name: vDoc.name, registration: vDoc.registrationNumber } : null
      }
    }

    return {
      success: true,
      data: {
        booking,
        trip,
        driver,
        vehicle,
      },
    }
  })

  // DELETE /api/bookings/:id — Cancel booking, release seats, and re-optimize remaining trip route
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const booking = await BookingModel.findOne({ id })
    if (!booking) {
      return reply.status(404).send({ success: false, error: { message: 'Booking not found' } })
    }

    booking.status = 'cancelled'
    await booking.save()

    if (booking.rideId && booking.rideId !== 'unassigned') {
      const trip = await RideModel.findOne({ id: booking.rideId })
      if (trip) {
        trip.bookedSeats = Math.max(0, trip.bookedSeats - (booking.seats || 1))
        trip.passengers = trip.passengers.filter((p) => p.studentId !== booking.studentId)
        if (trip.status === 'full') {
          trip.status = 'active'
        }
        await trip.save()

        // Re-optimize route without the cancelled passenger
        await routeProgressService.buildTripRoute(trip)

        realtimeService.broadcast('PASSENGER_REMOVED_FROM_TRIP', {
          tripId: trip.id,
          studentId: booking.studentId,
          bookedSeats: trip.bookedSeats,
        })
        realtimeService.broadcast('TRIP_ROUTE_UPDATED', {
          tripId: trip.id,
          trip,
        })
      }
    }

    return { success: true, message: 'Booking cancelled successfully.' }
  })
}
