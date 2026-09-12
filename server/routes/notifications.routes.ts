import { FastifyPluginAsync } from 'fastify'
import { NotificationModel } from '../models/Notification.js'
import { RideModel } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { BookingModel } from '../models/Booking.js'
import { realtimeService } from '../services/realtimeService.js'
import { authenticate } from '../middleware/auth.js'

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // Read Bearer token or demo headers and populate request.user
  fastify.addHook('preHandler', authenticate)

  // ── Send a ride message (student→driver or driver→student) ──────────────────
  // Persists as a Notification with type='message' so it survives refresh/logout.
  fastify.post('/message', async (request, reply) => {
    const body = (request.body || {}) as {
      rideId: string
      bookingId?: string
      senderId?: string
      senderName?: string
      senderRole?: 'student' | 'driver'
      receiverId?: string
      studentId?: string
      driverId?: string
      text: string
    }

    const text = (body.text || '').trim()
    if (!body.rideId || !text) {
      return reply.status(400).send({
        success: false,
        error: { message: 'rideId and text are required' },
      })
    }

    const authUser = request.user
    const userHeader = request.headers['x-user-id'] as string
    const driverHeader = request.headers['x-driver-id'] as string

    const senderRole = body.senderRole || (authUser?.role === 'DRIVER' ? 'driver' : 'student')
    const senderId =
      body.senderId ||
      authUser?.id ||
      (senderRole === 'driver' ? (driverHeader || userHeader) : (userHeader || driverHeader)) ||
      (senderRole === 'driver' ? 'd1' : 's1')

    const ride =
      (await RideModel.findOne({ id: body.rideId })) ||
      (await RideModel.findById(body.rideId).catch(() => null))

    // Authoritative assigned driver: prioritize the ride's assigned driver first, then body.driverId
    const assignedDriverId = ride?.driverId || body.driverId || 'd1'

    let recipientId: string
    let targetStudentId: string
    let senderName = body.senderName

    if (senderRole === 'student') {
      // Student → Driver: recipient is the ride's assigned driver
      recipientId = assignedDriverId
      targetStudentId = senderId

      let studentName = body.senderName
      if (!studentName) {
        const senderUser = await UserModel.findOne({ id: senderId })
        studentName = senderUser?.name || authUser?.name || 'Student'
      }
      senderName = studentName

      // Look up booking or passenger for pickup, destination, bookingTime
      const booking =
        (await BookingModel.findOne({ rideId: body.rideId, studentId: senderId })) ||
        (await BookingModel.findOne({ rideId: body.rideId }))
      const passenger =
        ride?.passengers?.find((p) => p.studentId === senderId) || ride?.passengers?.[0]

      const pickup = passenger?.pickup || booking?.pickup || ride?.pickupPoints?.[0]?.name || 'Pickup Point'
      const destination = passenger?.destination || booking?.destination || ride?.destination || 'Campus'
      const bookingTime =
        booking?.bookingTime ||
        (booking?.createdAt
          ? new Date(booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

      const driverUser = assignedDriverId ? await UserModel.findOne({ id: assignedDriverId }) : null
      const driverName = driverUser?.name || (ride as any)?.driverName || 'Driver'

      const notifId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      const doc = await NotificationModel.create({
        id: notifId,
        userId: assignedDriverId, // RECIPIENT is the assigned driver
        driverId: assignedDriverId,
        studentId: senderId,
        role: 'driver', // role of RECIPIENT
        type: 'message',
        priority: 'NORMAL',
        title: `Message from ${studentName}`,
        message: text,
        read: false,
        rideId: body.rideId,
        eventType: 'RIDE_MESSAGE',
        metadata: {
          rideId: body.rideId,
          bookingId: booking?.id || body.bookingId,
          studentId: senderId,
          studentName,
          driverId: assignedDriverId,
          driverName,
          senderId,
          receiverId: assignedDriverId,
          senderRole: 'student',
          pickup,
          destination,
          bookingTime,
          routeName: ride?.routeName || 'Campus Shuttle',
          fare: passenger?.fare || booking?.fare || ride?.fare,
          seatNo: passenger?.seatNo || booking?.seatNo,
        },
      })

      realtimeService.broadcast('NOTIFICATION_ADDED', { notification: doc.toObject() })
      realtimeService.broadcast('RIDE_MESSAGE', { message: doc.toObject() })

      return { success: true, data: doc }
    } else {
      // Driver → Student: find the specific student who booked or messaged
      let candidateStudentId = body.studentId || body.receiverId

      if (!candidateStudentId) {
        // Find latest student message in this ride thread
        const lastStudentMsg = await NotificationModel.findOne({
          rideId: body.rideId,
          type: 'message',
          $or: [{ 'metadata.senderRole': 'student' }, { role: 'driver' }],
        }).sort({ createdAt: -1 })

        candidateStudentId =
          lastStudentMsg?.studentId ||
          lastStudentMsg?.metadata?.studentId ||
          (ride?.passengers?.find((p) => p.status !== 'dropped') || ride?.passengers?.[0])?.studentId
      }

      if (!candidateStudentId) {
        return reply.status(400).send({
          success: false,
          error: { message: 'No passenger found on this ride to reply to' },
        })
      }

      targetStudentId = candidateStudentId
      recipientId = targetStudentId

      const driverUser =
        (await UserModel.findOne({ id: senderId })) ||
        (await UserModel.findOne({ id: assignedDriverId }))
      const driverName = body.senderName || driverUser?.name || 'Driver'

      const studentUser = await UserModel.findOne({ id: targetStudentId })
      const studentName = studentUser?.name || 'Student'

      const booking = await BookingModel.findOne({
        rideId: body.rideId,
        studentId: targetStudentId,
      })
      const passenger = ride?.passengers?.find((p) => p.studentId === targetStudentId)
      const pickup = passenger?.pickup || booking?.pickup || ride?.pickupPoints?.[0]?.name || 'Pickup Point'
      const destination = passenger?.destination || booking?.destination || ride?.destination || 'Campus'
      const bookingTime =
        booking?.bookingTime ||
        (booking?.createdAt
          ? new Date(booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

      const notifId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      const doc = await NotificationModel.create({
        id: notifId,
        userId: targetStudentId, // RECIPIENT is the student
        studentId: targetStudentId,
        driverId: assignedDriverId,
        role: 'student', // role of RECIPIENT
        type: 'message',
        priority: 'NORMAL',
        title: `Message from ${driverName}`,
        message: text,
        read: false,
        rideId: body.rideId,
        eventType: 'RIDE_MESSAGE',
        metadata: {
          rideId: body.rideId,
          bookingId: booking?.id || body.bookingId,
          studentId: targetStudentId,
          studentName,
          driverId: assignedDriverId,
          driverName,
          senderId,
          receiverId: targetStudentId,
          senderRole: 'driver',
          pickup,
          destination,
          bookingTime,
          routeName: ride?.routeName || 'Campus Shuttle',
        },
      })

      realtimeService.broadcast('NOTIFICATION_ADDED', { notification: doc.toObject() })
      realtimeService.broadcast('RIDE_MESSAGE', { message: doc.toObject() })

      return { success: true, data: doc }
    }
  })

  // ── Fetch full message thread for a ride ────────────────────────────────────
  // Returns all message-type notifications for this rideId (both directions).
  fastify.get('/messages/:rideId', async (request, reply) => {
    const { rideId } = request.params as { rideId: string }
    const msgs = await NotificationModel.find({ rideId, type: 'message' }).sort({ createdAt: 1 })
    return { success: true, data: msgs }
  })

  // ── Mark all messages for a ride as read ────────────────────────────────────
  fastify.post('/messages/:rideId/read', async (request, reply) => {
    const { rideId } = request.params as { rideId: string }
    const authUser = request.user
    const userHeader = request.headers['x-user-id'] as string
    const driverHeader = request.headers['x-driver-id'] as string
    const targetIds = [authUser?.id, userHeader, driverHeader].filter(Boolean) as string[]

    const filter: any = { rideId, type: 'message', read: false }
    if (targetIds.length > 0) {
      filter.$or = [
        { userId: { $in: targetIds } },
        { studentId: { $in: targetIds } },
        { driverId: { $in: targetIds } },
      ]
    }
    await NotificationModel.updateMany(filter, { read: true })
    return { success: true }
  })

  // ── Get notifications (driver, student, dispatcher) ─────────────────────────
  fastify.get('/', async (request) => {
    const query =
      (request.query as {
        userId?: string
        studentId?: string
        driverId?: string
        role?: string
        all?: string
        limit?: string
      }) || {}

    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)))
    const userHeader = request.headers['x-user-id'] as string
    const driverHeader = request.headers['x-driver-id'] as string
    const authUser = request.user

    const userId = authUser?.id || userHeader
    const userRole = (authUser?.role || query.role || '').toLowerCase()
    const isDriver = userRole === 'driver' || (userId && userId.startsWith('d')) || Boolean(driverHeader && driverHeader === userId)
    const driverId = isDriver ? (userId || driverHeader) : driverHeader

    // If 'all=true' or requested by dispatcher/admin, return all operational notifications
    const isDispatcherOrAdmin =
      query.all === 'true' ||
      userRole === 'dispatcher' ||
      userRole === 'admin' ||
      userId === 'dispatcher' ||
      userId === 'admin' ||
      userId === 'admin1'

    if (isDispatcherOrAdmin) {
      const notifs = await NotificationModel.find({}).sort({ createdAt: -1 }).limit(limit)
      return { success: true, data: notifs }
    }

    const targetUserIds = [userId, query.userId, query.studentId].filter(Boolean) as string[]
    const targetDriverIds = [driverId, query.driverId, isDriver ? userId : undefined].filter(Boolean) as string[]

    // Retrieve rides assigned to this driver so driver receives all ride notifications
    let driverRideIds: string[] = []
    if (targetDriverIds.length > 0) {
      const ridesForDriver = await RideModel.find({ driverId: { $in: targetDriverIds } }, { id: 1 })
      driverRideIds = ridesForDriver.map((r) => r.id)
    }

    // Retrieve rides booked by this student so student receives all replies
    let studentRideIds: string[] = []
    if (targetUserIds.length > 0) {
      const bookingsForStudent = await BookingModel.find({ studentId: { $in: targetUserIds } }, { rideId: 1 })
      studentRideIds = bookingsForStudent.map((b) => b.rideId)
    }

    const orConditions: any[] = []

    if (targetUserIds.length > 0) {
      orConditions.push(
        { userId: { $in: targetUserIds } },
        { studentId: { $in: targetUserIds }, role: { $in: ['student', 'faculty', 'STUDENT', 'FACULTY'] } },
        { 'metadata.receiverId': { $in: targetUserIds } }
      )
    }

    if (targetDriverIds.length > 0) {
      orConditions.push(
        { driverId: { $in: targetDriverIds }, role: { $in: ['driver', 'DRIVER'] } },
        { userId: { $in: targetDriverIds }, role: { $in: ['driver', 'DRIVER'] } },
        { 'metadata.driverId': { $in: targetDriverIds }, role: { $in: ['driver', 'DRIVER'] } },
        { 'metadata.receiverId': { $in: targetDriverIds } },
        { 'metadata.recipientId': { $in: targetDriverIds } }
      )
    }

    // System-wide broadcasts only (notifications with no specific target user)
    if (userRole) {
      orConditions.push({ role: userRole, userId: { $in: [null, undefined, ''] } })
    }
    orConditions.push({ role: 'all' })

    const filter = orConditions.length > 0 ? { $or: orConditions } : {}
    const notifs = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(limit)

    return { success: true, data: notifs }
  })

  // Mark single as read
  fastify.post('/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string }
    const notif = await NotificationModel.findOneAndUpdate(
      { id },
      { read: true },
      { new: true }
    )
    if (!notif) {
      return reply.status(404).send({ success: false, error: { message: 'Notification not found' } })
    }
    return { success: true, data: notif }
  })

  // Mark all as read
  fastify.post('/read-all', async (request) => {
    const userId = request.headers['x-user-id'] as string
    const driverId = request.headers['x-driver-id'] as string
    const body = (request.body as { userId?: string; role?: string; driverId?: string }) || {}

    const targetUserIds = [userId, body.userId].filter(Boolean) as string[]
    const targetDriverIds = [driverId, body.driverId].filter(Boolean) as string[]

    const orConditions: any[] = []
    if (targetUserIds.length > 0) {
      orConditions.push(
        { userId: { $in: targetUserIds } },
        { studentId: { $in: targetUserIds } },
        { 'metadata.studentId': { $in: targetUserIds } },
        { 'metadata.receiverId': { $in: targetUserIds } }
      )
    }
    if (targetDriverIds.length > 0) {
      orConditions.push(
        { driverId: { $in: targetDriverIds } },
        { userId: { $in: targetDriverIds } },
        { 'metadata.recipientId': { $in: targetDriverIds } }
      )
    }
    if (body.role) {
      orConditions.push({ role: body.role.toLowerCase() })
    }

    const filter = orConditions.length > 0 ? { $or: orConditions } : {}
    await NotificationModel.updateMany(filter, { read: true })

    return { success: true }
  })
}
