import { FastifyPluginAsync } from 'fastify'
import { SafetyEventModel } from '../models/SafetyEvent.js'
import { safetyService } from '../services/safetyService.js'

export const safetyRoutes: FastifyPluginAsync = async (fastify) => {
  // Trigger emergency SOS (Student, Faculty, or Driver)
  fastify.post('/sos', async (request, reply) => {
    const body = (request.body || {}) as {
      rideId?: string
      userId?: string
      lat?: number
      lng?: number
      emergencyPhone?: string
      emergencyName?: string
      emergencyEmail?: string
      forceNew?: boolean
    }

    const authUser = (request as any).user
    const userId = body.userId || authUser?.id || (request.headers['x-user-id'] as string) || (request.headers['x-driver-id'] as string) || 's1'

    const event = await safetyService.triggerSOS(
      body.rideId,
      userId,
      body.lat,
      body.lng,
      body.emergencyPhone,
      body.emergencyName,
      body.forceNew,
      body.emergencyEmail
    )
    const isExistingActive = Boolean((event as any)?.isExistingActive)

    return { success: true, isExistingActive, data: event }
  })

  // Trigger route deviation check
  fastify.post('/route-deviation', async (request, reply) => {
    const body = request.body as {
      rideId: string
      lat?: number
      lng?: number
    }

    if (!body.rideId) {
      return reply.status(400).send({ success: false, error: { message: 'rideId is required' } })
    }

    const lat = body.lat || 17.382
    const lng = body.lng || 78.472

    const result = await safetyService.checkRouteDeviation(body.rideId, lat, lng)
    return { success: true, data: result }
  })

  // List safety events with filtering
  fastify.get('/events', async (request) => {
    const query = request.query as { resolved?: string; status?: string; rideId?: string; userId?: string }
    const filter: any = {}

    if (query.resolved !== undefined) {
      filter.resolved = query.resolved === 'true'
    }
    if (query.status) {
      filter.status = query.status.toUpperCase()
    }
    if (query.rideId) {
      filter.rideId = query.rideId
    }
    if (query.userId) {
      filter.userId = query.userId
    }

    const events = await SafetyEventModel.find(filter).sort({ createdAt: -1 })
    return { success: true, data: events }
  })

  // Acknowledge safety event
  fastify.post('/events/:id/acknowledge', async (request, reply) => {
    const { id } = request.params as { id: string }
    const dispatcherId = (request.headers['x-user-id'] as string) || 'admin1'

    const acknowledged = await safetyService.acknowledgeEvent(id, dispatcherId)
    if (!acknowledged) {
      return reply.status(404).send({ success: false, error: { message: 'Safety event not found' } })
    }
    return { success: true, data: acknowledged }
  })

  // Resolve safety event
  fastify.post('/events/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string }
    const dispatcherId = (request.headers['x-user-id'] as string) || 'admin1'

    const resolved = await safetyService.resolveEvent(id, dispatcherId)
    if (!resolved) {
      return reply.status(404).send({ success: false, error: { message: 'Safety event not found' } })
    }
    return { success: true, data: resolved }
  })
}
