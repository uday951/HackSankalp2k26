import { SafetyEventModel, ISafetyEvent } from '../models/SafetyEvent.js'
import { RideModel } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { VehicleModel } from '../models/Vehicle.js'
import { BookingModel } from '../models/Booking.js'
import { EmergencyContactModel } from '../models/EmergencyContact.js'
import { NotificationModel } from '../models/Notification.js'
import { realtimeService } from './realtimeService.js'
import { notificationService } from './notificationService.js'
import { smsService } from './smsService.js'
import { twilioService } from './twilioService.js'
import { emailService } from './emailService.js'
import { haversineDistanceMeters } from './routingService.js'
import { ENV } from '../config/env.js'

// Minimum distance from a point to a line segment
function distancePointToSegmentMeters(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    return haversineDistanceMeters(px, py, x1, y1)
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const projX = x1 + t * dx
  const projY = y1 + t * dy

  return haversineDistanceMeters(px, py, projX, projY)
}

export class SafetyService {
  /**
   * Check if vehicle is off the planned route
   */
  async checkRouteDeviation(
    rideId: string,
    currentLat: number,
    currentLng: number
  ): Promise<{ hasDeviation: boolean; minDistanceMeters: number }> {
    const ride = await RideModel.findOne({ id: rideId })
    if (!ride || !ride.routeCoordinates || ride.routeCoordinates.length < 2) {
      return { hasDeviation: false, minDistanceMeters: 0 }
    }

    let minDistance = Infinity
    for (let i = 0; i < ride.routeCoordinates.length - 1; i++) {
      const [lat1, lng1] = ride.routeCoordinates[i]
      const [lat2, lng2] = ride.routeCoordinates[i + 1]
      const d = distancePointToSegmentMeters(currentLat, currentLng, lat1, lng1, lat2, lng2)
      if (d < minDistance) minDistance = d
    }

    const hasDeviation = minDistance > ENV.ROUTE_DEVIATION_THRESHOLD_METERS

    if (hasDeviation && !ride.hasDeviation) {
      ride.hasDeviation = true
      await ride.save()

      // Create Safety Event
      const eventId = `se-${Date.now()}`
      const safetyEvent = await SafetyEventModel.create({
        id: eventId,
        rideId,
        vehicleId: ride.vehicleId,
        eventType: 'ROUTE_DEVIATION',
        severity: 'HIGH',
        lat: currentLat,
        lng: currentLng,
        message: `Route deviation detected on ${ride.routeName} (${Math.round(minDistance)}m from planned route).`,
        status: 'ACTIVE',
        resolved: false,
      })

      // Centralized Safety Event Notification: Route Deviation
      const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
      const driverUser = await UserModel.findOne({ id: ride.driverId })

      await notificationService.notifyRideEvent('ROUTE_DEVIATION', {
        rideId,
        routeName: ride.routeName,
        driverId: ride.driverId,
        driverName: driverUser?.name || 'Driver',
        passengerIds,
        deviationMeters: Math.round(minDistance),
      })

      realtimeService.broadcast('SAFETY_ALERT', {
        rideId,
        safetyEvent,
        ride,
      })
    }

    return { hasDeviation, minDistanceMeters: Math.round(minDistance) }
  }

  /**
   * Trigger emergency SOS workflow for Student, Faculty, or Driver
   */
  async triggerSOS(
    rideId?: string,
    userId: string = 's1',
    lat?: number,
    lng?: number,
    emergencyPhone?: string,
    emergencyName?: string,
    forceNew?: boolean,
    emergencyEmail?: string
  ): Promise<any> {
    const user = await UserModel.findOne({
      $or: [
        { id: userId },
        { email: (userId || '').toLowerCase() },
        { phone: userId },
        { studentId: userId },
        { rollNumber: userId },
      ],
    })
    const resolvedUserId = user?.id || userId
    const userRole = (user?.role || 'STUDENT').toUpperCase()
    const isDriver = userRole === 'DRIVER'

    // Multi-key resolution for Emergency Contact
    const searchUserIds = [userId, resolvedUserId]
    if (user?.email) searchUserIds.push(user.email)
    if (user?.studentId) searchUserIds.push(user.studentId)
    if (user?.rollNumber) searchUserIds.push(user.rollNumber)

    let emergencyContact = await EmergencyContactModel.findOne({
      userId: { $in: searchUserIds },
    }).sort({ updatedAt: -1 })

    // Helper to filter dummy/sample fallback numbers
    const isDummyPhone = (p?: string) =>
      !p ||
      p.replace(/\D/g, '').includes('9876543210') ||
      p.replace(/\D/g, '').includes('9876543219') ||
      p.replace(/\D/g, '').length < 10

    let targetPhone = ''
    if (emergencyPhone && emergencyPhone.trim() && !isDummyPhone(emergencyPhone)) {
      targetPhone = emergencyPhone.trim()
    } else if (emergencyContact?.phone && !isDummyPhone(emergencyContact.phone)) {
      targetPhone = emergencyContact.phone.trim()
    } else if (user?.phone && !isDummyPhone(user.phone)) {
      targetPhone = user.phone.trim()
    } else {
      targetPhone = ENV.SOS_ALERT_PHONE_NUMBER || ''
    }

    // Resolve target email for emergency contact
    let targetEmail = ''
    if (emergencyEmail && emergencyEmail.trim().includes('@')) {
      targetEmail = emergencyEmail.trim()
    } else if (emergencyContact?.email && emergencyContact.email.trim().includes('@')) {
      targetEmail = emergencyContact.email.trim()
    } else if (user?.email && user.email.includes('@')) {
      targetEmail = user.email.trim()
    }

    // Spam prevention: Check if user already has an active unresolved SOS in the last 15 mins
    const existingActive = await SafetyEventModel.findOne({
      userId: { $in: [userId, resolvedUserId] },
      resolved: false,
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING'] },
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
    })

    const activeContactPhone = existingActive?.emergencyContact?.phone || ''
    const contactChanged = Boolean(emergencyPhone && !isDummyPhone(emergencyPhone) && activeContactPhone !== emergencyPhone.trim())

    if (existingActive && !forceNew && !contactChanged) {
      console.log(`[SafetyService] Active SOS already open for user ${resolvedUserId} (${existingActive.id}). Returning existing alert to prevent duplicate spam.`)
      return {
        ...existingActive.toObject(),
        isExistingActive: true,
      }
    }

    if (existingActive) {
      console.log(`[SafetyService] Superseding previous active SOS (${existingActive.id}) for user ${resolvedUserId}.`)
      existingActive.resolved = true
      existingActive.resolvedAt = new Date()
      existingActive.resolvedBy = 'SYSTEM_SUPERSEDED'
      existingActive.status = 'RESOLVED'
      await existingActive.save()
    }

    // Attempt to locate active ride if not explicitly provided
    let ride = rideId ? await RideModel.findOne({ id: rideId }) : null
    if (!ride) {
      if (isDriver) {
        ride = await RideModel.findOne({
          driverId: { $in: [userId, resolvedUserId] },
          status: { $in: ['active', 'boarding', 'waiting', 'full'] },
        })
      } else {
        const activeBooking = await BookingModel.findOne({
          studentId: { $in: [userId, resolvedUserId] },
          status: { $in: ['confirmed', 'boarded', 'in_transit'] },
        }).sort({ createdAt: -1 })
        if (activeBooking?.rideId) {
          ride = await RideModel.findOne({ id: activeBooking.rideId })
        }
      }
    }

    if (ride) {
      ride.hasSosAlert = true
      await ride.save()
    }

    const driverUser = ride?.driverId ? await UserModel.findOne({ id: ride.driverId }) : (isDriver ? user : null)
    const vehicle = ride?.vehicleId ? await VehicleModel.findOne({ id: ride.vehicleId }) : null

    if (emergencyPhone && emergencyPhone.trim() && !isDummyPhone(emergencyPhone)) {
      const cleanPhone = emergencyPhone.trim()
      const cleanName = (emergencyName || 'Emergency Contact').trim()
      if (emergencyContact) {
        emergencyContact.phone = cleanPhone
        if (cleanName) emergencyContact.name = cleanName
        if (targetEmail && !emergencyContact.email) emergencyContact.email = targetEmail
        await emergencyContact.save()
      } else {
        emergencyContact = await EmergencyContactModel.create({
          id: `ec-${resolvedUserId}-${Date.now().toString().slice(-4)}`,
          userId: resolvedUserId,
          name: cleanName,
          relationship: 'Emergency Contact',
          phone: cleanPhone,
          email: targetEmail || '',
          isPrimary: true,
        })
      }
      targetPhone = cleanPhone
    }

    const resolvedLat = lat ?? ride?.currentLat ?? vehicle?.currentLat ?? 17.398
    const resolvedLng = lng ?? ride?.currentLng ?? vehicle?.currentLng ?? 78.479
    const routeName = ride?.routeName || (ride ? `Campus Route #${ride.id}` : 'Campus Area')
    const passengerCount = (ride?.passengers || []).length
    const passengerIds = (ride?.passengers || []).map((p: any) => p.studentId).filter(Boolean)

    const eventId = `sos-${Date.now()}`
    const eventType = isDriver ? 'DRIVER_SOS_TRIGGERED' : 'STUDENT_SOS_TRIGGERED'

    let smsResult = { sent: false, status: 'NOT_CONFIGURED' as const, message: '' }
    let callResult = { success: false, status: 'NOT_CONFIGURED' as const, callSid: '', message: '' }

    if (targetPhone) {
      // 1. Dispatch Emergency SMS Alert
      try {
        const twilioRes = await twilioService.sendSOSAlert({
          recipientPhone: targetPhone,
          recipientName: emergencyContact?.name || emergencyName || 'Emergency Contact',
          senderName: user?.name || userId,
          senderRole: userRole,
          rideId: ride?.id,
          routeName: ride ? routeName : undefined,
          lat: resolvedLat,
          lng: resolvedLng,
          vehiclePlate: vehicle?.registrationNumber,
        })

        smsResult = {
          sent: twilioRes.success,
          status: (twilioRes.status === 'SENT' ? 'SENT' : twilioRes.status === 'FAILED' ? 'FAILED' : 'NOT_CONFIGURED') as any,
          message: twilioRes.success ? 'Twilio emergency SMS dispatched.' : (twilioRes.error || 'Failed to dispatch SMS'),
        }
      } catch (smsErr: any) {
        console.warn('[SafetyService] Twilio SOS SMS error (non-fatal):', smsErr?.message)
        smsResult = { sent: false, status: 'FAILED' as const, message: smsErr?.message || 'Twilio SMS failed' }
      }

      // 2. Dispatch Emergency Voice Call Alert
      try {
        const twilioCallRes = await twilioService.makeEmergencyCall({
          recipientPhone: targetPhone,
          recipientName: emergencyContact?.name || emergencyName || 'Emergency Contact',
          senderName: user?.name || userId,
          senderRole: userRole,
          rideId: ride?.id,
          routeName: ride ? routeName : undefined,
          lat: resolvedLat,
          lng: resolvedLng,
          vehiclePlate: vehicle?.registrationNumber,
        })

        callResult = {
          success: twilioCallRes.success,
          status: twilioCallRes.status,
          callSid: twilioCallRes.callSid || '',
          message: twilioCallRes.message || twilioCallRes.error || (twilioCallRes.success ? 'Twilio voice call initiated.' : 'Failed to initiate voice call'),
        }
      } catch (callErr: any) {
        console.warn('[SafetyService] Twilio SOS Voice Call error (non-fatal):', callErr?.message)
        callResult = { success: false, status: 'FAILED' as const, callSid: '', message: callErr?.message || 'Twilio Voice Call failed' }
      }
    } else {
      console.log('[SafetyService] No emergency contact phone or SOS_ALERT_PHONE_NUMBER configured.')
    }

    // 3. Dispatch Emergency Email Alert to Emergency Contact
    let emailResult = { sent: false, status: 'NOT_CONFIGURED' as const, message: '' }
    if (targetEmail) {
      try {
        emailResult = await emailService.sendEmergencySosEmail({
          to: targetEmail,
          userName: user?.name || resolvedUserId,
          userRole,
          tripId: ride?.id,
          vehicleInfo: vehicle?.registrationNumber || vehicle?.name,
          driverName: driverUser?.name || (isDriver ? user?.name : undefined),
          locationStr: `${resolvedLat.toFixed(4)}, ${resolvedLng.toFixed(4)}`,
          timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        })
      } catch (emailErr: any) {
        console.warn('[SafetyService] SOS email error (non-fatal):', emailErr?.message)
        emailResult = {
          sent: false,
          status: 'FAILED',
          message: emailErr?.message || 'Emergency email failed',
        }
      }
    } else {
      emailResult = {
        sent: false,
        status: 'NOT_CONFIGURED',
        message: 'Emergency email could not be sent because no emergency contact email is configured.',
      }
    }

    const contactSummary = emergencyContact
      ? `${emergencyContact.name} (${emergencyContact.relationship}: ${emergencyContact.phone}${emergencyContact.email ? `, ${emergencyContact.email}` : ''})`
      : (ENV.SOS_ALERT_PHONE_NUMBER ? `Campus Security (${ENV.SOS_ALERT_PHONE_NUMBER})` : 'None registered')

    const message = isDriver
      ? `CRITICAL DRIVER SOS: Driver ${user?.name || userId} triggered emergency alarm on ${routeName} (Vehicle: ${vehicle?.registrationNumber || vehicle?.name || 'TS 09 AB 1234'}, Passengers: ${passengerCount}). Emergency Contact: ${contactSummary}.`
      : `CRITICAL SOS: Passenger ${user?.name || userId} triggered emergency alarm on ${routeName}. Driver: ${driverUser?.name || 'Assigned Driver'}. Emergency Contact: ${contactSummary}.`

    const safetyEvent = await SafetyEventModel.create({
      id: eventId,
      rideId: ride?.id || 'standalone-sos',
      userId,
      userName: user?.name || userId,
      userRole,
      userPhone: user?.phone,
      vehicleId: ride?.vehicleId,
      driverId: ride?.driverId || (isDriver ? userId : undefined),
      driverName: driverUser?.name || (isDriver ? user?.name : undefined),
      routeName,
      passengerCount,
      eventType,
      severity: 'CRITICAL',
      lat: resolvedLat,
      lng: resolvedLng,
      message,
      status: 'ACTIVE',
      resolved: false,
      emergencyContact: emergencyContact
        ? {
            name: emergencyContact.name,
            relationship: emergencyContact.relationship,
            phone: emergencyContact.phone,
            email: emergencyContact.email || targetEmail || undefined,
          }
        : (targetEmail ? { name: emergencyName || 'Emergency Contact', relationship: 'Emergency Contact', phone: targetPhone || '', email: targetEmail } : undefined),
      smsStatus: smsResult.status,
      smsMessage: smsResult.message,
      callStatus: callResult.status,
      callSid: callResult.callSid,
      callMessage: callResult.message,
      emailStatus: emailResult.status,
      emailMessage: emailResult.message,
    })

    // Centralized Event Notification dispatch
    if (isDriver) {
      await notificationService.notifyRideEvent('DRIVER_SOS_TRIGGERED', {
        rideId: ride?.id,
        routeName,
        driverId: userId,
        driverName: user?.name || userId,
        vehicleId: ride?.vehicleId,
        vehiclePlate: vehicle?.registrationNumber,
        passengerIds,
        priority: 'CRITICAL',
        metadata: {
          locationStr: `${resolvedLat.toFixed(4)}, ${resolvedLng.toFixed(4)}`,
          passengerCount,
        },
      })
    } else {
      await notificationService.notifyRideEvent('STUDENT_SOS_TRIGGERED', {
        rideId: ride?.id,
        routeName,
        driverId: ride?.driverId,
        driverName: driverUser?.name || 'Driver',
        studentId: userId,
        studentName: user?.name || userId,
        priority: 'CRITICAL',
        metadata: {
          locationStr: `${resolvedLat.toFixed(4)}, ${resolvedLng.toFixed(4)}`,
        },
      })
    }

    // Broadcast live telemetry packet across WebSocket with alarm flag
    realtimeService.broadcast('SAFETY_ALERT', {
      rideId: ride?.id,
      safetyEvent,
      ride,
      user: user ? { id: user.id, name: user.name, phone: user.phone, role: user.role } : null,
      driver: driverUser ? { id: driverUser.id, name: driverUser.name, phone: driverUser.phone } : null,
      vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, registration: vehicle.registrationNumber } : null,
      emergencyContact: safetyEvent.emergencyContact,
      smsStatus: smsResult.status,
      callStatus: callResult.status,
      emailStatus: emailResult.status,
      emailMessage: emailResult.message,
      playAlarm: true,
    })

    return {
      ...safetyEvent.toObject(),
      user: user ? { name: user.name, phone: user.phone, role: user.role } : null,
      driver: driverUser ? { name: driverUser.name, phone: driverUser.phone } : null,
      emergencyContact: safetyEvent.emergencyContact || null,
      smsResult,
      callResult,
      emailResult,
      playAlarm: true,
    }
  }

  /**
   * Acknowledge safety event by Dispatcher
   */
  async acknowledgeEvent(eventId: string, dispatcherId: string = 'admin1'): Promise<ISafetyEvent | null> {
    const event = await SafetyEventModel.findOne({ id: eventId })
    if (!event) return null

    event.status = 'ACKNOWLEDGED'
    event.acknowledgedAt = new Date()
    event.acknowledgedBy = dispatcherId
    await event.save()

    const ride = event.rideId && event.rideId !== 'standalone-sos' ? await RideModel.findOne({ id: event.rideId }) : null
    const driverUser = ride?.driverId ? await UserModel.findOne({ id: ride.driverId }) : null

    await notificationService.notifyRideEvent('SOS_ACKNOWLEDGED', {
      rideId: event.rideId,
      routeName: event.routeName || ride?.routeName,
      driverId: event.driverId || ride?.driverId,
      driverName: event.driverName || driverUser?.name,
      studentId: event.userId,
      studentName: event.userName,
    })

    realtimeService.broadcast('SAFETY_EVENT_ACKNOWLEDGED', {
      eventId,
      status: 'ACKNOWLEDGED',
      safetyEvent: event,
      rideId: event.rideId,
    })

    realtimeService.broadcast('SAFETY_ALERT', {
      eventId,
      status: 'ACKNOWLEDGED',
      safetyEvent: event,
      rideId: event.rideId,
    })

    return event
  }

  /**
   * Resolve safety event by Dispatcher
   */
  async resolveEvent(eventId: string, dispatcherId: string = 'admin1'): Promise<ISafetyEvent | null> {
    const event = await SafetyEventModel.findOne({ id: eventId })
    if (!event) return null

    event.resolved = true
    event.status = 'RESOLVED'
    event.resolvedAt = new Date()
    event.resolvedBy = dispatcherId
    await event.save()

    // If no more active events on this ride, clear ride deviation & SOS flags
    if (event.rideId && event.rideId !== 'standalone-sos') {
      const remaining = await SafetyEventModel.countDocuments({
        rideId: event.rideId,
        resolved: false,
      })

      const ride = await RideModel.findOne({ id: event.rideId })
      if (remaining === 0 && ride) {
        ride.hasDeviation = false
        ride.hasSosAlert = false
        await ride.save()
      }

      if (ride) {
        const passengerIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
        const driverUser = await UserModel.findOne({ id: ride.driverId })
        await notificationService.notifyRideEvent('SOS_RESOLVED', {
          rideId: event.rideId,
          routeName: ride.routeName,
          driverId: ride.driverId,
          driverName: driverUser?.name || 'Driver',
          studentId: event.userId,
          passengerIds,
        })
      }
    }

    realtimeService.broadcast('SAFETY_EVENT_RESOLVED', {
      eventId,
      resolved: true,
      status: 'RESOLVED',
      safetyEvent: event,
      rideId: event.rideId,
    })

    realtimeService.broadcast('SAFETY_ALERT', {
      eventId,
      resolved: true,
      status: 'RESOLVED',
      safetyEvent: event,
      rideId: event.rideId,
    })

    return event
  }
}

export const safetyService = new SafetyService()
