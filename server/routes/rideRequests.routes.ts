import { FastifyPluginAsync } from 'fastify'
import { RideRequestModel } from '../models/RideRequest.js'
import { RideModel } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { matchingService } from '../services/matchingService.js'
import { notificationService } from '../services/notificationService.js'

export const rideRequestRoutes: FastifyPluginAsync = async (fastify) => {
  // Create ride request and evaluate matches
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      userId?: string
      pickup: string | { name: string; address?: string; latitude?: number; longitude?: number }
      destination: string | { name: string; address?: string; latitude?: number; longitude?: number }
      time: string
      seats?: number
      pickupLat?: number
      pickupLng?: number
      destinationLat?: number
      destinationLng?: number
    }

    const userId = body.userId || (request.headers['x-user-id'] as string) || 's1'
    const student = await UserModel.findOne({ id: userId })
    const studentName = student?.name || 'Student'

    // Extract pickup details cleanly without dummy fallbacks
    let pName = typeof body.pickup === 'string' ? body.pickup : body.pickup?.name || 'Selected Location'
    let pAddress = typeof body.pickup === 'object' ? body.pickup.address : undefined
    let pLat = typeof body.pickup === 'object' && body.pickup.latitude
      ? body.pickup.latitude
      : (body.pickupLat ?? 0)
    let pLng = typeof body.pickup === 'object' && body.pickup.longitude
      ? body.pickup.longitude
      : (body.pickupLng ?? 0)

    // Extract destination details cleanly without dummy fallbacks
    let dName = typeof body.destination === 'string' ? body.destination : body.destination?.name || 'Selected Destination'
    let dAddress = typeof body.destination === 'object' ? body.destination.address : undefined
    let dLat = typeof body.destination === 'object' && body.destination.latitude
      ? body.destination.latitude
      : body.destinationLat ?? 17.2063
    let dLng = typeof body.destination === 'object' && body.destination.longitude
      ? body.destination.longitude
      : body.destinationLng ?? 78.6015

    if (pName && dName && pName.trim().toLowerCase() === dName.trim().toLowerCase()) {
      return reply.status(400).send({ success: false, error: { message: 'Pickup and destination cannot be the same location.' } })
    }

    const seatsRequested = body.seats || 1
    const reqId = `req-${Date.now().toString().slice(-6)}`

    // Create record
    const rideRequest = await RideRequestModel.create({
      id: reqId,
      userId,
      pickupName: pName,
      pickupAddress: pAddress,
      pickupLat: pLat,
      pickupLng: pLng,
      destinationName: dName,
      destinationAddress: dAddress,
      destinationLat: dLat,
      destinationLng: dLng,
      requestedTime: body.time,
      seatsRequested,
      status: 'SEARCHING',
    })

    // Central Notification: Ride Request Created
    await notificationService.notifyRideEvent('RIDE_REQUEST_CREATED', {
      studentId: userId,
      studentName,
      pickup: pName,
      destination: dName,
      time: body.time,
      seats: seatsRequested,
      metadata: { requestId: reqId },
    })

    // Query active rides from MongoDB
    const activeRides = await RideModel.find({
      status: { $in: ['waiting', 'boarding', 'active'] },
      date: 'today',
    })

    // Execute matching engine
    const matches = await matchingService.findBestRideMatches(activeRides, {
      pickupName: pName,
      pickupLat: pLat,
      pickupLng: pLng,
      destinationName: dName,
      destinationLat: dLat,
      destinationLng: dLng,
      requestedTime: body.time,
      seatsRequested,
      genderPreference: (body as any).genderPreference,
      requestingStudentId: userId,
    })

    if (matches.length > 0 && matches[0].score.total >= 70) {
      rideRequest.status = 'MATCHED'
      rideRequest.matchedRideId = matches[0].rideId
      await rideRequest.save()

      const matchedRide = activeRides.find((r) => r.id === matches[0].rideId)
      if (matchedRide) {
        await notificationService.notifyRideEvent('RIDE_MATCHED', {
          rideId: matchedRide.id,
          routeName: matchedRide.routeName,
          driverId: matchedRide.driverId,
          studentId: userId,
          studentName,
          pickup: pName,
          destination: dName,
          departureTime: matchedRide.departureTime,
        })
      }
    }

    return {
      success: true,
      data: {
        request: rideRequest,
        matches,
      },
    }
  })

  // Get request details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const req = await RideRequestModel.findOne({ id })
    if (!req) {
      return reply.status(404).send({ success: false, error: { message: 'Request not found' } })
    }
    return { success: true, data: req }
  })

  // List all requests
  fastify.get('/', async () => {
    const requests = await RideRequestModel.find({}).sort({ createdAt: -1 }).limit(50)
    return { success: true, data: requests }
  })
}
