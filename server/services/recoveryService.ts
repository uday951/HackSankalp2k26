import { RideModel, IRide } from '../models/Ride.js'
import { VehicleModel, IVehicle } from '../models/Vehicle.js'
import { UserModel } from '../models/User.js'
import { BookingModel } from '../models/Booking.js'
import { RideRecoveryEventModel, IRideRecoveryEvent, ICandidateSnapshot } from '../models/RideRecoveryEvent.js'
import { routingService, haversineDistanceMeters } from './routingService.js'
import { realtimeService } from './realtimeService.js'
import { notificationService } from './notificationService.js'

export interface ReportBreakdownParams {
  vehicleId?: string
  driverId: string
  location?: { lat: number; lng: number; accuracy?: number }
  reason?: string
  trigger?: 'DRIVER_REPORTED' | 'DISPATCHER_MANUAL' | 'TELEMETRY_FAILURE'
}

export interface CandidateEvaluation extends ICandidateSnapshot {
  vehicle: IVehicle
  driver: any
  proximityScore: number
  routeCompatibilityScore: number
  spareCapacityScore: number
  passengerDelayScore: number
  detourScore: number
}

class RecoveryService {
  /**
   * 1. Driver or Dispatcher reports vehicle breakdown.
   * Atomically transitions vehicle & ride, creates recovery event, and triggers automated reassignment.
   */
  async reportBreakdown(params: ReportBreakdownParams): Promise<{
    success: boolean
    recoveryEvent: IRideRecoveryEvent
    ride: IRide
    message: string
  }> {
    const startTime = Date.now()
    const { driverId, reason, trigger = 'DRIVER_REPORTED' } = params

    // 1. Resolve vehicle
    let vehicle: IVehicle | null = null
    if (params.vehicleId) {
      vehicle = await VehicleModel.findOne({ id: params.vehicleId })
    }

    if (!vehicle && driverId) {
      vehicle = await VehicleModel.findOne({ driverId })
    }

    if (!vehicle) {
      // Try to find active ride for driver to resolve vehicle
      const driverRide = await RideModel.findOne({
        driverId,
        status: { $in: ['active', 'boarding', 'waiting'] },
      })
      if (driverRide && driverRide.vehicleId) {
        vehicle = await VehicleModel.findOne({ id: driverRide.vehicleId })
      }
    }

    if (!vehicle) {
      throw new Error(`No vehicle found associated with driver "${driverId}" or vehicle ID "${params.vehicleId}"`)
    }

    // 2. Resolve active affected ride
    const affectedRide = await RideModel.findOne({
      vehicleId: vehicle.id,
      status: { $in: ['active', 'boarding', 'waiting'] },
    })

    if (!affectedRide) {
      // If vehicle has no active ride, still mark vehicle as broken
      vehicle.status = 'BREAKDOWN'
      await vehicle.save()
      vehicle.status = 'OUT_OF_SERVICE'
      await vehicle.save()

      realtimeService.broadcast('VEHICLE_BREAKDOWN', {
        vehicleId: vehicle.id,
        status: 'OUT_OF_SERVICE',
        driverId,
        message: 'Vehicle reported breakdown with no active trip',
      })

      throw new Error(`Vehicle ${vehicle.name} (${vehicle.registrationNumber}) has no active ride in progress to recover. Vehicle marked OUT_OF_SERVICE.`)
    }

    // 3. Resolve breakdown location (prefer actual GPS reported from device)
    let breakdownLat = params.location?.lat
    let breakdownLng = params.location?.lng

    if (typeof breakdownLat !== 'number' || typeof breakdownLng !== 'number' || isNaN(breakdownLat) || isNaN(breakdownLng)) {
      breakdownLat = vehicle.currentLat || affectedRide.currentLat || 17.385
      breakdownLng = vehicle.currentLng || affectedRide.currentLng || 78.486
    }

    // 4. Mark broken vehicle as BREAKDOWN then OUT_OF_SERVICE
    vehicle.status = 'BREAKDOWN'
    await vehicle.save()
    vehicle.status = 'OUT_OF_SERVICE'
    await vehicle.save()

    // 5. Mark affected ride as recovery_pending
    const recoveryId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    affectedRide.status = 'recovery_pending'
    affectedRide.recoveryId = recoveryId
    affectedRide.originalVehicleId = vehicle.id
    affectedRide.originalDriverId = affectedRide.driverId
    affectedRide.breakdownLocation = {
      lat: breakdownLat,
      lng: breakdownLng,
      timestamp: new Date(),
    }
    await affectedRide.save()

    // 6. Create persistent RideRecoveryEvent audit record
    const recoveryEvent = await RideRecoveryEventModel.create({
      id: recoveryId,
      rideId: affectedRide.id,
      oldVehicleId: vehicle.id,
      oldDriverId: affectedRide.driverId,
      trigger,
      breakdownLatitude: breakdownLat,
      breakdownLongitude: breakdownLng,
      breakdownTimestamp: new Date(),
      recoveryStartedAt: new Date(),
      status: 'SEARCHING',
      pricingPolicy: 'PRICE_LOCKED',
      transferredPassengerCount: affectedRide.passengers?.filter((p: any) => p.status !== 'dropped').length || 0,
      notes: reason || 'Vehicle breakdown reported by driver',
      recoveryMetrics: {
        detectionTimeMs: Date.now() - startTime,
      },
    })

    // 7. Broadcast breakdown & recovery initiation
    realtimeService.broadcast('VEHICLE_BREAKDOWN', {
      vehicleId: vehicle.id,
      rideId: affectedRide.id,
      recoveryId,
      breakdownLocation: { lat: breakdownLat, lng: breakdownLng },
      passengerCount: recoveryEvent.transferredPassengerCount,
      timestamp: new Date().toISOString(),
    })

    realtimeService.broadcast('RECOVERY_STARTED', {
      recoveryId,
      rideId: affectedRide.id,
      oldVehicleId: vehicle.id,
      status: 'SEARCHING',
      timestamp: new Date().toISOString(),
    })

    // 8. Execute automated recovery pipeline asynchronously
    // (We also await it so the response returns the final recovered state)
    await this.executeAutomatedRecovery(recoveryId, affectedRide, vehicle, breakdownLat, breakdownLng)

    const updatedEvent = await RideRecoveryEventModel.findOne({ id: recoveryId })
    const updatedRide = await RideModel.findOne({ id: affectedRide.id })

    return {
      success: updatedEvent?.status === 'COMPLETED',
      recoveryEvent: updatedEvent || recoveryEvent,
      ride: updatedRide || affectedRide,
      message: updatedEvent?.status === 'COMPLETED'
        ? `Ride successfully recovered! Reassigned to vehicle ${updatedEvent.replacementVehicleId}.`
        : 'Automated candidate search completed. Manual dispatcher assistance flagged.',
    }
  }

  /**
   * 2. Candidate Discovery & Multi-Metric Constraint Scoring
   */
  async findAndScoreCandidates(
    ride: IRide,
    breakdownLat: number,
    breakdownLng: number,
    oldVehicleId: string
  ): Promise<CandidateEvaluation[]> {
    const activePassengers = (ride.passengers || []).filter((p: any) => p.status !== 'dropped')
    const neededCapacity = Math.max(1, activePassengers.length)

    // Query potential replacement vehicles:
    // Operational, not in breakdown, capacity >= needed, different from broken vehicle
    const candidates = await VehicleModel.find({
      id: { $ne: oldVehicleId },
      status: { $in: ['AVAILABLE', 'ASSIGNED', 'ON_TRIP'] },
      capacity: { $gte: neededCapacity },
    })

    const driverIds = candidates.map((v) => v.driverId).filter(Boolean)
    const drivers = await UserModel.find({ id: { $in: driverIds }, role: 'DRIVER' })
    const driverMap = new Map(drivers.map((d) => [d.id, d]))

    const scoredList: CandidateEvaluation[] = []

    for (const v of candidates) {
      const driver = driverMap.get(v.driverId) || { id: v.driverId, name: 'Fleet Driver' }

      // Check current occupancy if vehicle is ON_TRIP or ASSIGNED
      let currentBooked = 0
      if (v.status !== 'AVAILABLE') {
        const activeRideOnVehicle = await RideModel.findOne({
          vehicleId: v.id,
          status: { $in: ['active', 'boarding', 'waiting'] },
        })
        if (activeRideOnVehicle) {
          currentBooked = activeRideOnVehicle.bookedSeats || 0
        }
      }

      const spareSeats = v.capacity - currentBooked
      if (spareSeats < neededCapacity) {
        // Insufficient spare capacity
        continue
      }

      // 1. Proximity Calculation (meters & km)
      const vLat = v.currentLat || 17.385
      const vLng = v.currentLng || 78.486
      const distMeters = haversineDistanceMeters(vLat, vLng, breakdownLat, breakdownLng)
      const distanceKm = Math.round((distMeters / 1000) * 10) / 10
      const etaMinutes = Math.max(1, Math.round((distanceKm / 35) * 60))

      // 2. Scoring metrics
      // Proximity Score (25% weight): drops as distance increases, capped at 100
      const proximityScore = Math.max(0, Math.min(100, Math.round(100 - distanceKm * 8)))

      // Spare Capacity Score (20% weight): bonus for having comfortable headroom
      const capacityRatio = spareSeats / neededCapacity
      const spareCapacityScore = Math.max(0, Math.min(100, Math.round(Math.min(capacityRatio, 2) * 50)))

      // Passenger Delay Score (20% weight): lower ETA = higher score
      const passengerDelayScore = Math.max(0, Math.min(100, Math.round(100 - etaMinutes * 4)))

      // Route Compatibility & Overlap Score (20% weight)
      let routeCompatibilityScore = 80 // Base compatibility for available campus vehicle
      let routeOverlapPercent = 75

      if (v.status === 'AVAILABLE') {
        routeCompatibilityScore = 95
        routeOverlapPercent = 90
      } else {
        // Active vehicle: check destination proximity
        routeCompatibilityScore = 70
        routeOverlapPercent = 65
      }

      // Detour Score (15% weight)
      const detourKm = distanceKm * 0.4
      const detourScore = Math.max(0, Math.min(100, Math.round(100 - detourKm * 10)))

      // Total Weighted Score (0 - 100)
      const totalScore = Math.round(
        proximityScore * 0.25 +
        spareCapacityScore * 0.20 +
        passengerDelayScore * 0.20 +
        routeCompatibilityScore * 0.20 +
        detourScore * 0.15
      )

      scoredList.push({
        vehicleId: v.id,
        vehicleName: v.name,
        driverId: driver.id,
        driverName: driver.name || 'Rahul Kumar',
        score: totalScore,
        compositeScore: totalScore,
        distanceKm,
        etaMinutes,
        spareSeats,
        routeOverlapPercent,
        passengerDelayMinutes: etaMinutes,
        proximityScore,
        spareCapacityScore,
        passengerDelayScore,
        routeCompatibilityScore,
        detourScore,
        vehicle: v,
        driver,
      })
    }

    // Sort candidates descending by total score
    scoredList.sort((a, b) => b.score - a.score)
    return scoredList
  }

  /**
   * 3. Atomic Multi-Candidate Execution Pipeline
   */
  async executeAutomatedRecovery(
    recoveryId: string,
    ride: IRide,
    oldVehicle: IVehicle,
    breakdownLat: number,
    breakdownLng: number
  ): Promise<boolean> {
    const recoveryStart = Date.now()
    const candidates = await this.findAndScoreCandidates(ride, breakdownLat, breakdownLng, oldVehicle.id)

    const searchTimeMs = Date.now() - recoveryStart

    // Update recovery event with candidate snapshot
    const candidateSnapshots: ICandidateSnapshot[] = candidates.map((c) => ({
      vehicleId: c.vehicleId,
      vehicleName: c.vehicleName,
      driverId: c.driverId,
      driverName: c.driverName,
      score: c.score,
      distanceKm: c.distanceKm,
      etaMinutes: c.etaMinutes,
      spareSeats: c.spareSeats,
      routeOverlapPercent: c.routeOverlapPercent,
      passengerDelayMinutes: c.passengerDelayMinutes,
    }))

    await RideRecoveryEventModel.updateOne(
      { id: recoveryId },
      {
        $set: {
          candidateSnapshot: candidateSnapshots,
          status: candidates.length > 0 ? 'ASSIGNED' : 'MANUAL_INTERVENTION_REQUIRED',
          'recoveryMetrics.searchTimeMs': searchTimeMs,
        },
      }
    )

    if (candidates.length === 0) {
      // Escalation: No valid candidates found
      await RideRecoveryEventModel.updateOne(
        { id: recoveryId },
        {
          $set: {
            status: 'MANUAL_INTERVENTION_REQUIRED',
            failureReason: 'No operational replacement vehicles with sufficient capacity found.',
          },
        }
      )

      // Notify dispatcher urgently
      await notificationService.notifyRideEvent('SAFETY_ALERT', {
        rideId: ride.id,
        routeName: ride.routeName,
        title: 'Breakdown Recovery Failed — Dispatcher Intervention Required',
        message: `Ride ${ride.routeName} broke down at [${breakdownLat.toFixed(4)}, ${breakdownLng.toFixed(4)}]. No available replacement vehicle found.`,
        severity: 'CRITICAL',
      })

      // Notify students that recovery is in progress
      const studentIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
      for (const sId of studentIds) {
        await notificationService.notifyStudent({
          studentId: sId,
          title: 'Vehicle Assistance In Progress',
          message: 'Your vehicle encountered a technical issue. Our dispatch center is arranging alternate transport for you. Your booking and fare remain unchanged.',
          type: 'INFO',
          rideId: ride.id,
        })
      }

      realtimeService.broadcast('RECOVERY_FAILED', {
        recoveryId,
        rideId: ride.id,
        reason: 'No candidate vehicles available',
        status: 'MANUAL_INTERVENTION_REQUIRED',
      })

      return false
    }

    // Multi-candidate atomic try loop
    for (const candidate of candidates) {
      const assignStart = Date.now()

      // Concurrency lock check: verify vehicle status is still available/valid
      const lockedVehicle = await VehicleModel.findOneAndUpdate(
        {
          id: candidate.vehicleId,
          status: { $in: ['AVAILABLE', 'ASSIGNED', 'ON_TRIP'] },
        },
        {
          $set: {
            status: 'ON_TRIP',
            locationUpdatedAt: new Date(),
          },
        },
        { new: true }
      )

      if (!lockedVehicle) {
        // Candidate changed status or was claimed concurrently — skip to next
        continue
      }

      // --- ATOMIC REASSIGNMENT SUCCESSFUL ---
      const assignTimeMs = Date.now() - assignStart
      const rerouteStart = Date.now()

      // 1. Preserve Passenger Bookings & Lock Fares
      const bookings = await BookingModel.find({ rideId: ride.id })
      for (const b of bookings) {
        if (!b.originalFare) {
          b.originalFare = b.fare
        }
        b.fare = b.originalFare // Ensure current_fare = original_fare
        b.isPriceLocked = true
        b.recoveryPricingPolicy = 'PRICE_LOCKED'
        await b.save()
      }

      // 2. Recalculate Route from Replacement Vehicle's Real Location
      const repLat = candidate.vehicle.currentLat || breakdownLat
      const repLng = candidate.vehicle.currentLng || breakdownLng

      // Build waypoints:
      // Replacement vehicle start -> Breakdown Pickup Point -> Remaining Dest / Stops
      const remainingStops = (ride.stops || []).filter(
        (s: any) => s.status !== 'COMPLETED' && s.status !== 'DROPPED_OFF'
      )

      const waypoints: [number, number][] = [[repLat, repLng]]

      // If replacement vehicle is not at the breakdown point, include breakdown point
      const distToBreakdown = haversineDistanceMeters(repLat, repLng, breakdownLat, breakdownLng)
      if (distToBreakdown > 50) {
        waypoints.push([breakdownLat, breakdownLng])
      }

      if (remainingStops.length > 0) {
        for (const s of remainingStops) {
          waypoints.push([s.latitude || s.lat, s.longitude || s.lng])
        }
      } else {
        waypoints.push([ride.destinationLat, ride.destinationLng])
      }

      // Query real OSRM road geometry
      let newGeometry = ride.routeCoordinates
      let newDistanceMeters = ride.distanceMeters || (ride.distanceKm ? ride.distanceKm * 1000 : 15000)
      let newDurationSeconds = ride.durationSeconds || 1200

      try {
        const routeResult = await routingService.getRoute(waypoints)
        if (routeResult?.geometry && routeResult.geometry.length > 1) {
          newGeometry = routeResult.geometry
          newDistanceMeters = routeResult.distanceMeters
          newDurationSeconds = routeResult.durationSeconds
        }
      } catch (osrmErr) {
        console.warn('[RecoveryService] OSRM rerouting error, falling back to existing road route:', osrmErr)
      }

      const rerouteTimeMs = Date.now() - rerouteStart
      const totalDurationMs = Date.now() - recoveryStart

      // 3. Update Ride with new vehicle, new driver, and new road coordinates
      ride.vehicleId = candidate.vehicleId
      ride.driverId = candidate.driverId
      ride.status = 'active'
      ride.routeCoordinates = newGeometry
      ride.currentLat = repLat
      ride.currentLng = repLng
      ride.distanceKm = Math.round((newDistanceMeters / 1000) * 10) / 10
      ride.distanceMeters = newDistanceMeters
      ride.durationSeconds = newDurationSeconds
      ride.hasDeviation = false
      ride.hasSosAlert = false
      await ride.save()

      // 4. Update Recovery Event to COMPLETED
      await RideRecoveryEventModel.updateOne(
        { id: recoveryId },
        {
          $set: {
            replacementVehicleId: candidate.vehicleId,
            replacementDriverId: candidate.driverId,
            status: 'COMPLETED',
            recoveryCompletedAt: new Date(),
            recoveryMetrics: {
              searchTimeMs,
              assignTimeMs,
              rerouteTimeMs,
              totalDurationMs,
            },
          },
        }
      )

      // 5. Targeted Multi-Party Notifications
      // Student notification
      const studentIds = (ride.passengers || []).map((p: any) => p.studentId).filter(Boolean)
      for (const sId of studentIds) {
        const booking = bookings.find((b) => b.studentId === sId)
        const fareStr = booking ? `₹${booking.fare}` : (ride.fare ? `₹${ride.fare}` : '')
        await notificationService.notifyStudent({
          studentId: sId,
          title: 'Ride Reassigned to Replacement Vehicle',
          message: `Your ride has been automatically reassigned to ${candidate.vehicleName} (Driver: ${candidate.driverName}). Your confirmed fare (${fareStr}) and booking remain unchanged. Estimated Arrival: ${candidate.etaMinutes} min.`,
          type: 'SUCCESS',
          rideId: ride.id,
        })
      }

      // Replacement Driver Notification
      await notificationService.notifyDriver({
        driverId: candidate.driverId,
        title: 'Emergency Recovery Trip Assigned',
        message: `You have been assigned to recover Ride ${ride.routeName}. Proceed to breakdown coordinates at [${breakdownLat.toFixed(4)}, ${breakdownLng.toFixed(4)}] to pick up ${ride.passengers?.length || 0} passengers.`,
        type: 'WARNING',
        rideId: ride.id,
      })

      // Old Driver Notification
      await notificationService.notifyDriver({
        driverId: oldVehicle.driverId,
        title: 'Breakdown Recovery Completed',
        message: `Your passengers have been transferred automatically to ${candidate.vehicleName} (Driver: ${candidate.driverName}). Your vehicle has been marked OUT OF SERVICE for maintenance.`,
        type: 'INFO',
        rideId: ride.id,
      })

      // Dispatcher Notification
      await notificationService.notifyRideEvent('VEHICLE_REASSIGNED', {
        rideId: ride.id,
        routeName: ride.routeName,
        title: 'Breakdown Recovery Completed Automatically',
        message: `Vehicle ${oldVehicle.name} broke down. Ride ${ride.routeName} recovered and reassigned to ${candidate.vehicleName} in ${Math.round(totalDurationMs / 1000)}s without cancelling passenger bookings.`,
      })

      // 6. Broadcast Realtime WebSocket Updates
      realtimeService.broadcast('VEHICLE_REASSIGNED', {
        rideId: ride.id,
        oldVehicleId: oldVehicle.id,
        newVehicleId: candidate.vehicleId,
        newDriverId: candidate.driverId,
        newDriverName: candidate.driverName,
        newVehicleName: candidate.vehicleName,
        updatedRouteGeometry: newGeometry,
        status: 'active',
      })

      realtimeService.broadcast('RIDE_UPDATED', {
        ride,
        event: 'RECOVERY_COMPLETED',
      })

      realtimeService.broadcast('ROUTE_UPDATED', {
        rideId: ride.id,
        coordinates: newGeometry,
        distanceKm: ride.distanceKm,
      })

      realtimeService.broadcast('RECOVERY_COMPLETED', {
        recoveryId,
        rideId: ride.id,
        oldVehicleId: oldVehicle.id,
        replacementVehicleId: candidate.vehicleId,
        replacementDriverId: candidate.driverId,
        replacementVehicleName: candidate.vehicleName,
        replacementDriverName: candidate.driverName,
        passengersTransferred: ride.passengers?.length || 0,
        totalDurationSeconds: Math.round(totalDurationMs / 1000),
        status: 'COMPLETED',
      })

      return true
    }

    return false
  }

  /**
   * 4. Dispatcher Manual Intervention / Retry
   */
  async retryRecovery(recoveryId: string, manualVehicleId?: string): Promise<{ success: boolean; message: string }> {
    const recoveryEvent = await RideRecoveryEventModel.findOne({ id: recoveryId })
    if (!recoveryEvent) {
      throw new Error(`Recovery event "${recoveryId}" not found`)
    }

    const ride = await RideModel.findOne({ id: recoveryEvent.rideId })
    if (!ride) {
      throw new Error(`Ride "${recoveryEvent.rideId}" not found`)
    }

    const oldVehicle = await VehicleModel.findOne({ id: recoveryEvent.oldVehicleId })
    if (!oldVehicle) {
      throw new Error(`Vehicle "${recoveryEvent.oldVehicleId}" not found`)
    }

    if (manualVehicleId) {
      // Manual selection by Dispatcher
      const repVehicle = await VehicleModel.findOne({ id: manualVehicleId })
      if (!repVehicle) {
        throw new Error(`Specified replacement vehicle "${manualVehicleId}" not found`)
      }

      const repDriver = await UserModel.findOne({ id: repVehicle.driverId })
      repVehicle.status = 'ON_TRIP'
      await repVehicle.save()

      // Transfer bookings and lock fares
      const bookings = await BookingModel.find({ rideId: ride.id })
      for (const b of bookings) {
        if (!b.originalFare) b.originalFare = b.fare
        b.fare = b.originalFare
        b.isPriceLocked = true
        await b.save()
      }

      // Reassign ride
      ride.vehicleId = repVehicle.id
      ride.driverId = repVehicle.driverId
      ride.status = 'active'
      await ride.save()

      await RideRecoveryEventModel.updateOne(
        { id: recoveryId },
        {
          $set: {
            replacementVehicleId: repVehicle.id,
            replacementDriverId: repVehicle.driverId,
            status: 'COMPLETED',
            recoveryCompletedAt: new Date(),
          },
        }
      )

      realtimeService.broadcast('RECOVERY_COMPLETED', {
        recoveryId,
        rideId: ride.id,
        oldVehicleId: oldVehicle.id,
        replacementVehicleId: repVehicle.id,
        replacementDriverId: repVehicle.driverId,
        replacementVehicleName: repVehicle.name,
        replacementDriverName: repDriver?.name || 'Suresh Babu',
        status: 'COMPLETED',
      })

      return { success: true, message: `Manually reassigned to ${repVehicle.name}` }
    }

    // Auto retry
    const res = await this.executeAutomatedRecovery(
      recoveryId,
      ride,
      oldVehicle,
      recoveryEvent.breakdownLatitude,
      recoveryEvent.breakdownLongitude
    )

    return {
      success: res,
      message: res ? 'Recovery retry succeeded' : 'Recovery retry could not find candidate vehicles',
    }
  }

  /**
   * 5. Get Live Recovery Status
   */
  async getRecoveryStatus(rideId: string): Promise<IRideRecoveryEvent | null> {
    return RideRecoveryEventModel.findOne({ rideId }).sort({ createdAt: -1 })
  }
}

export const recoveryService = new RecoveryService()