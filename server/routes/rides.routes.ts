import { FastifyPluginAsync } from 'fastify'
import { RideModel } from '../models/Ride.js'
import { BookingModel } from '../models/Booking.js'
import { UserModel } from '../models/User.js'
import { VehicleModel } from '../models/Vehicle.js'
import { NotificationModel } from '../models/Notification.js'
import { realtimeService } from '../services/realtimeService.js'
import { notificationService } from '../services/notificationService.js'
import { routingService } from '../services/routingService.js'
import { routeProgressService } from '../services/routeProgressService.js'
import { pricingEngine } from '../services/pricingEngine.js'
import { PricingEventModel } from '../models/PricingEvent.js'
import { RideFareModel } from '../models/RideFare.js'

export const rideRoutes: FastifyPluginAsync = async (fastify) => {
  // List all rides
  fastify.get('/', async (request) => {
    const query = request.query as { status?: string; date?: string }
    const filter: any = {}
    if (query.status && query.status !== 'all') {
      filter.status = query.status.toLowerCase()
    } else if (!query.status) {
      // Default: exclude completed rides from the browse/available list
      filter.status = { $ne: 'completed' }
    }
    if (query.date) {
      filter.date = query.date
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

  // Get active trips across the campus
  fastify.get('/active', async () => {
    const activeTrips = await RideModel.find({
      status: { $in: ['waiting', 'boarding', 'active'] },
    }).sort({ createdAt: -1 })

    const driverIds = [...new Set(activeTrips.map((r) => r.driverId).filter(Boolean))]
    const vehicleIds = [...new Set(activeTrips.map((r) => r.vehicleId).filter(Boolean))]
    const [drivers, vehicles] = await Promise.all([
      UserModel.find({ id: { $in: driverIds } }),
      VehicleModel.find({ id: { $in: vehicleIds } }),
    ])
    const driverMap = new Map(drivers.map((d) => [d.id, d]))
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]))

    const hydrated = activeTrips.map((r) => {
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

  // Get single ride
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }
    const [driver, vehicle] = await Promise.all([
      UserModel.findOne({ id: ride.driverId }),
      VehicleModel.findOne({ id: ride.vehicleId }),
    ])
    const rObj = ride.toObject ? ride.toObject() : { ...ride }
    return {
      success: true,
      data: {
        ...rObj,
        driverName: driver?.name || ride.driverName || 'Rahul Kumar',
        driverPhone: driver?.phone || ride.driverPhone || '+91 99887 76655',
        driverRating: driver?.rating || ride.driverRating || 4.8,
        driverAvatar: driver?.avatar || (driver?.name ? driver.name.slice(0, 2).toUpperCase() : 'RK'),
        vehicleName: vehicle?.name || ride.vehicleName || 'Campus Shuttle Bus 01 (V1)',
        vehiclePlate: vehicle?.registrationNumber || ride.vehiclePlate || 'TS 09 AB 1234',
      },
    }
  })

  // Get live authoritative trip state (Sections 39, 74, 75)
  fastify.get('/:id/live', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    // Ensure route is initialized
    if (!ride.tripRoute || !ride.tripRoute.geometry || ride.tripRoute.geometry.length < 2) {
      await routeProgressService.buildTripRoute(ride)
    }

    const [driver, vehicle] = await Promise.all([
      UserModel.findOne({ id: ride.driverId }),
      VehicleModel.findOne({ id: ride.vehicleId }),
    ])

    const stops = ride.stops || []
    const currentStopIndex = ride.tripRoute?.currentStopIndex || 0
    const currentStop = stops[currentStopIndex] || null

    const progress = {
      percent: ride.tripRoute?.progressPercent || 0,
      remainingDistanceMeters: ride.tripRoute?.remainingDistanceMeters || 0,
      remainingDurationSeconds: ride.tripRoute?.remainingDurationSeconds || 0,
      distanceTraveledMeters: Math.max(
        0,
        (ride.tripRoute?.distanceMeters || 0) - (ride.tripRoute?.remainingDistanceMeters || 0)
      ),
      etaString: ride.estimatedArrival || '8:35 AM',
      isOffRoute: ride.hasDeviation || false,
      deviationMeters: 0,
    }

    return {
      success: true,
      data: {
        ride,
        driver: driver
          ? {
              id: driver.id,
              name: driver.name,
              phone: driver.phone,
              avatar: driver.avatar,
              rating: driver.rating,
              totalTrips: (driver as any).totalTrips || 100,
            }
          : undefined,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              name: vehicle.name,
              registration: vehicle.registrationNumber,
              type: vehicle.vehicleType,
              capacity: vehicle.capacity,
              color: vehicle.color,
              currentLat: vehicle.currentLat,
              currentLng: vehicle.currentLng,
              heading: vehicle.heading || 0,
              speed: vehicle.speed || 0,
            }
          : undefined,
        route: ride.tripRoute,
        stops,
        progress,
        currentStop,
        nextManeuver: ride.tripRoute?.steps?.[0] || undefined,
        status: ride.status,
      },
    }
  })

  // Get enriched passenger manifest for a ride (merges ride.passengers + BookingModel)
  fastify.get('/:id/passengers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    // Start with ride.passengers as the base
    const passengerMap = new Map<string, any>()
    for (const p of ride.passengers || []) {
      passengerMap.set(p.studentId, {
        studentId: p.studentId,
        name: p.name || 'Student Passenger',
        pickup: p.pickup || '',
        destination: p.destination || ride.destination,
        status: p.status || 'waiting',
        seatNo: p.seatNo,
        gender: p.gender,
        genderPreference: p.genderPreference,
        bookingId: p.bookingId,
        fare: p.fare,
      })
    }

    // Enrich / fill gaps from BookingModel
    const bookings = await BookingModel.find({ rideId: id, status: { $ne: 'cancelled' } })
    const studentIds = [...new Set(bookings.map((b) => b.studentId))]
    const users = await UserModel.find({ id: { $in: studentIds } }, { id: 1, name: 1, gender: 1 })
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

    for (const b of bookings) {
      const user = userMap[b.studentId]
      const existing = passengerMap.get(b.studentId)
      if (existing) {
        // Merge booking data into existing passenger record
        passengerMap.set(b.studentId, {
          ...existing,
          name: existing.name !== 'Student Passenger' ? existing.name : (b.studentName || user?.name || existing.name),
          pickup: existing.pickup || b.pickupName || b.pickup,
          destination: existing.destination || b.destinationName || b.destination || ride.destination,
          bookingId: existing.bookingId || b.id,
          fare: existing.fare || b.fare,
          gender: existing.gender || user?.gender,
          bookingStatus: b.status,
        })
      } else {
        // Add passenger from booking if not in ride.passengers (can happen if event was missed)
        const bookingStatus = b.status
        passengerMap.set(b.studentId, {
          studentId: b.studentId,
          name: b.studentName || user?.name || 'Student Passenger',
          pickup: b.pickupName || b.pickup || '',
          destination: b.destinationName || b.destination || ride.destination,
          status: bookingStatus === 'in_transit' ? 'boarded' : bookingStatus === 'completed' ? 'dropped' : 'waiting',
          seatNo: b.seatNo || passengerMap.size + 1,
          gender: user?.gender,
          bookingId: b.id,
          fare: b.fare,
          bookingStatus,
        })
      }
    }

    return { success: true, data: Array.from(passengerMap.values()) }
  })

  // Get current trip route
  fastify.get('/:id/route', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }
    if (!ride.tripRoute) {
      await routeProgressService.buildTripRoute(ride)
    }
    return { success: true, data: ride.tripRoute }
  })


  // Create new ride
  fastify.post('/', async (request, reply) => {
    const body = request.body as any
    const startLoc = (body.startLocation || body.pickupPoints?.[0]?.name || '').trim().toLowerCase()
    const destLoc = (body.destination || '').trim().toLowerCase()
    if (startLoc && destLoc && startLoc === destLoc) {
      return reply.status(400).send({ success: false, error: { message: 'Pickup and destination cannot be the same location.' } })
    }
    const rideId = body.id || `ride-${Date.now().toString().slice(-4)}`

    // Generate initial OSRM route if coordinates exist
    let routeCoords = body.routeCoordinates || []
    if (routeCoords.length === 0 && body.pickupPoints && body.pickupPoints.length > 0) {
      const waypoints: [number, number][] = [
        ...body.pickupPoints.map((pp: any) => [pp.lat, pp.lng] as [number, number]),
        [body.destinationLat, body.destinationLng],
      ]
      const osrmRoute = await routingService.getRoute(waypoints)
      routeCoords = osrmRoute.geometry
    }

    const startLocationName = body.startLocation || (body.pickupPoints?.[0]?.name) || 'Current Position'
    const startLat = typeof body.startLocationLat === 'number' ? body.startLocationLat : (body.pickupPoints?.[0]?.lat ?? body.currentLat ?? 17.3616)
    const startLng = typeof body.startLocationLng === 'number' ? body.startLocationLng : (body.pickupPoints?.[0]?.lng ?? body.currentLng ?? 78.4747)

    // Fair & Real Driver Assignment:
    // Dynamically assign an available real driver across the fleet instead of defaulting to d1
    let assignedDriverId = body.driverId
    let assignedDriverName = body.driverName
    let assignedDriverPhone = body.driverPhone
    let assignedDriverRating = body.driverRating || 4.8
    let assignedDriverAvatar = body.driverAvatar
    let assignedVehicleId = body.vehicleId
    let assignedVehicleName = body.vehicleName
    let assignedVehiclePlate = body.vehiclePlate

    const allDrivers = await UserModel.find({ role: 'DRIVER' })
    if (allDrivers.length > 0) {
      if (!assignedDriverId || (assignedDriverId === 'd1' && !body.driverId)) {
        // Query active rides to find which drivers currently have active/boarding/waiting trips
        const activeRides = await RideModel.find({ status: { $in: ['active', 'boarding', 'waiting'] } })
        const busyDriverIds = new Set(activeRides.map((r) => r.driverId))

        // Find available drivers who do not currently have an active ride
        const availableDrivers = allDrivers.filter((d) => !busyDriverIds.has(d.id))
        const chosenDriver = availableDrivers.length > 0
          ? availableDrivers[Math.floor(Math.random() * availableDrivers.length)]
          : allDrivers[Math.floor(Math.random() * allDrivers.length)]

        assignedDriverId = chosenDriver.id
        assignedDriverName = chosenDriver.name
        assignedDriverPhone = chosenDriver.phone
        assignedDriverRating = chosenDriver.rating || 4.8
        assignedDriverAvatar = chosenDriver.avatar || (chosenDriver.name ? chosenDriver.name.slice(0, 2).toUpperCase() : 'DR')

        const driverVehicle = await VehicleModel.findOne({ driverId: chosenDriver.id })
        if (driverVehicle) {
          assignedVehicleId = driverVehicle.id
          assignedVehicleName = driverVehicle.name
          assignedVehiclePlate = driverVehicle.registrationNumber
        }
      } else if (assignedDriverId) {
        const dUser = await UserModel.findOne({ id: assignedDriverId })
        if (dUser) {
          assignedDriverName = dUser.name
          assignedDriverPhone = dUser.phone
          assignedDriverRating = dUser.rating || 4.8
          assignedDriverAvatar = dUser.avatar || (dUser.name ? dUser.name.slice(0, 2).toUpperCase() : 'DR')
        }
        if (!assignedVehicleId) {
          const vUser = await VehicleModel.findOne({ driverId: assignedDriverId })
          if (vUser) {
            assignedVehicleId = vUser.id
            assignedVehicleName = vUser.name
            assignedVehiclePlate = vUser.registrationNumber
          }
        }
      }
    }

    const newRide = await RideModel.create({
      id: rideId,
      routeName: body.routeName || `Campus Route #${rideId}`,
      driverId: assignedDriverId || 'd1',
      driverName: assignedDriverName || 'Rahul Kumar',
      driverPhone: assignedDriverPhone || '+91 99887 76655',
      driverRating: assignedDriverRating || 4.8,
      driverAvatar: assignedDriverAvatar || 'RK',
      vehicleId: assignedVehicleId || 'v1',
      vehicleName: assignedVehicleName || 'Campus Shuttle Bus 01 (V1)',
      vehiclePlate: assignedVehiclePlate || 'TS 09 AB 1234',
      startLocation: startLocationName,
      startLocationLat: startLat,
      startLocationLng: startLng,
      pickupPoints: body.pickupPoints && body.pickupPoints.length > 0 ? body.pickupPoints : [
        {
          id: `pp-${Date.now()}`,
          name: startLocationName,
          lat: startLat,
          lng: startLng,
          estimatedPickupTime: body.departureTime || 'Immediate',
        }
      ],
      destination: body.destination || 'SRI INDU Campus Main Gate',
      destinationLat: body.destinationLat || 17.2063,
      destinationLng: body.destinationLng || 78.6015,
      departureTime: body.departureTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      estimatedArrival: body.estimatedArrival || '',
      capacity: body.capacity || 6,
      bookedSeats: body.bookedSeats || 0,
      passengers: body.passengers || [],
      status: body.status || 'active',
      fare: body.fare || 25,
      routeCoordinates: routeCoords,
      currentLat: startLat,
      currentLng: startLng,
      distanceKm: body.distanceKm || 4.2,
      hasDeviation: false,
      hasSosAlert: false,
      isFemaleOnly: Boolean(body.isFemaleOnly || body.genderPreference === 'FEMALE_ONLY'),
      genderPreference: (body.isFemaleOnly || body.genderPreference === 'FEMALE_ONLY') ? 'FEMALE_ONLY' : (body.genderPreference || 'ANYONE'),
      date: body.date || 'today',
    })

    // Initialize TripRoute and stops starting at startLocation
    await routeProgressService.buildTripRoute(newRide, startLat, startLng, startLocationName)

    realtimeService.broadcast('RIDE_STARTED', { rideId: newRide.id, ride: newRide })
    realtimeService.broadcast('RIDE_UPDATED', { ride: newRide })

    return { success: true, data: newRide }
  })

  // Join existing ride with ATOMIC concurrency protection
  fastify.post('/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      studentId: string
      pickup: string
      pickupName?: string
      pickupAddress?: string
      pickupCoords?: { lat: number; lng: number }
      destination?: string
      destinationName?: string
      destinationAddress?: string
      destinationCoords?: { lat: number; lng: number }
      seats?: number
      genderPreference?: string
    }

    const requestedSeats = body.seats || 1
    const studentId = body.studentId || (request.headers['x-user-id'] as string) || 's1'

    const pLoc = (body.pickupName || body.pickup || '').trim().toLowerCase()
    const dLoc = (body.destinationName || body.destination || '').trim().toLowerCase()
    if (pLoc && dLoc && pLoc === dLoc) {
      return reply.status(400).send({ success: false, error: { message: 'Pickup and destination cannot be the same location.' } })
    }

    // Fetch student info
    const student = await UserModel.findOne({ id: studentId })
    const studentName = student?.name || 'Student'
    const studentGender = student?.gender || 'Prefer not to say'

    // First, inspect the ride
    const currentRide = await RideModel.findOne({ id })
    if (!currentRide) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    // --- Strict Female Passenger Only Policy Enforcement ---
    const requestedGenderPref = body.genderPreference || 'ANYONE'
    const isRideAlreadyFemaleOnly = Boolean(
      currentRide.isFemaleOnly ||
      currentRide.genderPreference === 'FEMALE_ONLY' ||
      currentRide.passengers?.some((p: any) => p.genderPreference === 'FEMALE_ONLY')
    )

    // Rule 1: If the ride is designated female-only, male passengers CANNOT join
    if (isRideAlreadyFemaleOnly && studentGender === 'Male') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'GENDER_RESTRICTION',
          message: 'This ride is designated for female passengers only. Male passengers cannot join.',
        },
      })
    }

    // Rule 2: If student explicitly requests Female-Only ride:
    if (requestedGenderPref === 'FEMALE_ONLY') {
      if (studentGender === 'Male') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PREFERENCE',
            message: 'Female-only preference is available for female passengers only.',
          },
        })
      }

      // If ride already has existing passengers, verify NONE of them are male
      if (currentRide.passengers.length > 0) {
        const passengerIds = currentRide.passengers.map((p) => p.studentId)
        const existingUsers = await UserModel.find({ id: { $in: passengerIds } })
        const hasMalePassenger = existingUsers.some((u) => u.gender === 'Male')
        if (hasMalePassenger) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INCOMPATIBLE_GROUP',
              message: 'Cannot select female-only: this ride already contains male passengers.',
            },
          })
        }
      }
    }

    if (currentRide.bookedSeats + requestedSeats > currentRide.capacity) {
      return reply.status(409).send({
        success: false,
        error: { code: 'RIDE_FULL', message: 'This ride has no available capacity.' },
      })
    }

    const nextSeatNo = currentRide.bookedSeats + 1
    const studentDestination = body.destinationName || body.destination || currentRide.destination
    const newPassenger = {
      studentId,
      name: studentName,
      pickup: body.pickupName || body.pickup,
      destination: studentDestination,
      status: 'waiting' as const,
      seatNo: nextSeatNo,
      gender: studentGender,
      genderPreference: requestedGenderPref,
    }

    // Atomic update to guarantee no race-condition overbooking
    const updatedRide = await RideModel.findOneAndUpdate(
      {
        id,
        bookedSeats: { $lte: currentRide.capacity - requestedSeats },
        status: { $nin: ['full', 'completed', 'cancelled'] },
      },
      {
        $inc: { bookedSeats: requestedSeats },
        $push: { passengers: newPassenger },
      },
      { new: true }
    )

    if (!updatedRide) {
      return reply.status(409).send({
        success: false,
        error: { code: 'RIDE_FULL', message: 'Seat was booked by another student concurrently.' },
      })
    }

    // If ride was or now becomes female-only, lock it into the ride document
    const shouldBeFemaleOnly = isRideAlreadyFemaleOnly || requestedGenderPref === 'FEMALE_ONLY'
    if (shouldBeFemaleOnly && (!updatedRide.isFemaleOnly || updatedRide.genderPreference !== 'FEMALE_ONLY')) {
      updatedRide.isFemaleOnly = true
      updatedRide.genderPreference = 'FEMALE_ONLY'
      await updatedRide.save()
    }

    // If capacity reached, mark status as full
    if (updatedRide.bookedSeats >= updatedRide.capacity) {
      updatedRide.status = 'full'
      await updatedRide.save()
      realtimeService.broadcast('RIDE_FULL', { rideId: id })
    }

    let pickupCoords: { lat: number; lng: number } | undefined = undefined
    const rawPickup = body.pickupCoords as any
    if (rawPickup) {
      if (Array.isArray(rawPickup) && rawPickup.length >= 2) {
        pickupCoords = { lat: rawPickup[0], lng: rawPickup[1] }
      } else if (typeof rawPickup.lat === 'number') {
        pickupCoords = { lat: rawPickup.lat, lng: rawPickup.lng }
      }
    }
    let destinationCoords: { lat: number; lng: number } | undefined = undefined
    const rawDest = body.destinationCoords as any
    if (rawDest) {
      if (Array.isArray(rawDest) && rawDest.length >= 2) {
        destinationCoords = { lat: rawDest[0], lng: rawDest[1] }
      } else if (typeof rawDest.lat === 'number') {
        destinationCoords = { lat: rawDest.lat, lng: rawDest.lng }
      }
    }

    const pLat = pickupCoords?.lat || currentRide.pickupPoints?.[0]?.lat || 17.4934
    const pLng = pickupCoords?.lng || currentRide.pickupPoints?.[0]?.lng || 78.3995
    const dLat = destinationCoords?.lat || currentRide.destinationLat
    const dLng = destinationCoords?.lng || currentRide.destinationLng

    // Deterministic + AI Advisory Passenger-Specific Fare Calculation
    const fareCalc = await pricingEngine.calculatePassengerFare(
      {
        studentId,
        studentName,
        pickupName: body.pickupName || body.pickup,
        pickupLat: pLat,
        pickupLng: pLng,
        destinationName: studentDestination,
        destinationLat: dLat,
        destinationLng: dLng,
        seats: requestedSeats,
      },
      currentRide,
      { status: 'CONFIRMED', trigger: 'PASSENGER_JOINED' }
    )

    // Create Booking with explicit coordinates and locked fare
    const bookingId = `b-${Date.now().toString().slice(-6)}`
    const booking = await BookingModel.create({
      id: bookingId,
      studentId,
      studentName,
      rideId: id,
      pickup: body.pickup,
      pickupName: body.pickupName || body.pickup,
      pickupAddress: body.pickupAddress,
      pickupLat: pLat,
      pickupLng: pLng,
      destination: studentDestination,
      destinationName: studentDestination,
      destinationAddress: body.destinationAddress,
      destinationLat: dLat,
      destinationLng: dLng,
      fare: fareCalc.finalAmount,
      fareBreakdown: fareCalc.breakdown,
      isPriceLocked: true,
      pricingVersion: fareCalc.pricingVersion,
      seats: requestedSeats,
      seatNo: nextSeatNo,
      status: 'confirmed',
      bookingTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })

    // Persist authoritative RideFare and audit event in DB
    const savedFare = await pricingEngine.saveAuthoritativeFare(
      bookingId,
      id,
      studentId,
      fareCalc,
      'Passenger joined pooled ride',
      'PASSENGER_JOINED'
    )

    // Update passenger entry in ride with its individual fare
    const passengerEntry = updatedRide.passengers.find((p: any) => p.studentId === studentId && p.seatNo === nextSeatNo)
    if (passengerEntry) {
      passengerEntry.fare = fareCalc.finalAmount
      passengerEntry.fareId = savedFare.id
      passengerEntry.bookingId = bookingId
      await updatedRide.save()
    }

    // Dynamically update route and stops for the new pickup & dropoff
    await routeProgressService.handlePassengerJoin(
      updatedRide,
      studentId,
      studentName,
      body.pickupName || body.pickup,
      pickupCoords,
      studentDestination,
      destinationCoords
    )

    // Central Ride Event Notification
    const driverUser = await UserModel.findOne({ id: updatedRide.driverId })
    await notificationService.notifyRideEvent('PASSENGER_ADDED', {
      rideId: id,
      routeName: updatedRide.routeName,
      driverId: updatedRide.driverId,
      driverName: driverUser?.name || 'Driver',
      studentId,
      studentName,
      pickup: body.pickupName || body.pickup,
      destination: studentDestination,
      departureTime: updatedRide.departureTime,
      fare: fareCalc.finalAmount,
    })

    // Broadcast Realtime Update
    realtimeService.broadcast('BOOKING_CREATED', { booking, ride: updatedRide, fare: savedFare })
    realtimeService.broadcast('RIDE_UPDATED', { ride: updatedRide })

    return {
      success: true,
      data: {
        booking,
        ride: updatedRide,
        fare: savedFare,
      },
    }
  })

  // Cancel booking
  fastify.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { studentId } = request.body as { studentId: string }

    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    const passenger = ride.passengers.find((p: any) => p.studentId === studentId)
    if (!passenger) {
      return reply.status(404).send({ success: false, error: { message: 'Passenger not booked on this ride' } })
    }

    // Remove passenger and decrement seats
    ride.passengers = ride.passengers.filter((p: any) => p.studentId !== studentId)
    ride.bookedSeats = Math.max(0, ride.bookedSeats - 1)
    if (ride.status === 'full') {
      ride.status = 'boarding'
    }
    await ride.save()

    // Dynamically adjust stops and route
    await routeProgressService.handlePassengerCancel(ride, studentId)

    // Update booking and log pricing cancellation event
    const cancelledBooking = await BookingModel.findOne({ rideId: id, studentId, status: { $ne: 'cancelled' } })
    if (cancelledBooking) {
      const oldFare = cancelledBooking.fare
      cancelledBooking.status = 'cancelled'
      await cancelledBooking.save()

      // Record audit event
      const eventId = `pe-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      await PricingEventModel.create({
        id: eventId,
        rideId: id,
        bookingId: cancelledBooking.id,
        eventType: 'PASSENGER_CANCELLED',
        oldAmount: oldFare,
        newAmount: 0,
        trigger: 'PASSENGER_CANCELLED',
        reason: 'Passenger cancelled booking. Seat released, route recalculated. Confirmed co-passenger fares remain locked.',
      })

      await RideFareModel.findOneAndUpdate(
        { bookingId: cancelledBooking.id },
        { calculationStatus: 'CREDITED' }
      )
    }

    // Recompute vehicle-level pricing rollups
    await pricingEngine.updateRideAggregates(id)

    // Central Notification: Passenger Cancelled
    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const cancelledStudent = await UserModel.findOne({ id: studentId })
    await notificationService.notifyRideEvent('PASSENGER_CANCELLED', {
      rideId: id,
      routeName: ride.routeName,
      driverId: ride.driverId,
      driverName: driverUser?.name || 'Driver',
      studentId,
      studentName: cancelledStudent?.name || passenger?.name || 'Student',
    })

    realtimeService.broadcast('BOOKING_CANCELLED', { rideId: id, studentId })
    realtimeService.broadcast('RIDE_UPDATED', { ride })
    realtimeService.broadcast('PRICING_UPDATED' as any, { rideId: id, studentId, eventType: 'PASSENGER_CANCELLED' })

    return { success: true, data: ride }
  })

  // Recalculate route
  fastify.post('/:id/recalculate-route', async (request, reply) => {
    const { id } = request.params as { id: string }
    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }
    const currentLat = ride.currentLat || ride.destinationLat
    const currentLng = ride.currentLng || ride.destinationLng
    const updatedRoute = await routeProgressService.reroute(ride, currentLat, currentLng)
    return { success: true, data: updatedRoute }
  })

  // Start ride
  fastify.post('/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = (request.body as any) || {}
    const { startLat, startLng, startLocation } = body

    const ride = await RideModel.findOne({ id })
    if (!ride) {
      return reply.status(404).send({ success: false, error: { message: 'Ride not found' } })
    }

    const driverUser = await UserModel.findOne({ id: ride.driverId })
    const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)

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

  // Complete ride
  fastify.post('/:id/complete', async (request, reply) => {
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

  // List all bookings or bookings for student
  fastify.get('/bookings/user/:studentId', async (request) => {
    const { studentId } = request.params as { studentId: string }
    const bookings = await BookingModel.find({ studentId }).sort({ bookedAt: -1 })
    return { success: true, data: bookings }
  })

  fastify.get('/bookings', async (request) => {
    const query = request.query as { studentId?: string; rideId?: string }
    const filter: any = {}
    if (query.studentId) filter.studentId = query.studentId
    if (query.rideId) filter.rideId = query.rideId
    const bookings = await BookingModel.find(filter).sort({ bookedAt: -1 })

    // Enrich bookings with passenger name from UserModel
    const studentIds = [...new Set(bookings.map((b) => b.studentId))]
    const users = await UserModel.find({ id: { $in: studentIds } }, { id: 1, name: 1 })
    const nameMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

    const enriched = bookings.map((b) => ({
      ...b.toObject(),
      passengerName: nameMap[b.studentId] || b.studentId,
      studentName: nameMap[b.studentId] || b.studentId,
    }))

    return { success: true, data: enriched }
  })
}
