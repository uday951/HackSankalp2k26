import type { FastifyPluginAsync } from 'fastify'
import { pythonOptimizerService } from '../services/pythonOptimizerService.js'
import { RideRequestModel } from '../models/RideRequest.js'
import { VehicleModel } from '../models/Vehicle.js'
import { RideModel } from '../models/Ride.js'
import { UserModel } from '../models/User.js'
import { BookingModel } from '../models/Booking.js'
import { AuditLogModel } from '../models/AuditLog.js'
import { realtimeService } from '../services/realtimeService.js'
import { notificationService } from '../services/notificationService.js'
import { tripGroupingService } from '../services/tripGroupingService.js'

export const optimizationRoutes: FastifyPluginAsync = async (fastify) => {
  // Check Python Service Health / Availability
  fastify.get('/status', async () => {
    const isOnline = await pythonOptimizerService.isAvailable()
    return {
      success: true,
      python_service_online: isOnline,
      engine: isOnline ? 'Python 3.12 (OR-Tools, Scikit-Learn, DBSCAN)' : 'Node.js Local Heuristic Fallback',
      timestamp: new Date().toISOString(),
    }
  })

  // Candidate Request Clustering (DBSCAN)
  fastify.post('/cluster', async (request: any, reply) => {
    const { requests: inputRequests, eps_km, min_samples } = request.body || {}
    let requestsToCluster = inputRequests

    // If none passed, load pending unassigned requests from database
    if (!requestsToCluster || requestsToCluster.length === 0) {
      const dbReqs = await RideRequestModel.find({ status: 'pending' }).limit(30)
      requestsToCluster = dbReqs.map((r: any) => ({
        id: r._id.toString(),
        student_id: r.studentId,
        pickup: {
          lat: r.pickupLocation?.coordinates?.[1] || 17.3850,
          lng: r.pickupLocation?.coordinates?.[0] || 78.4867,
          name: r.pickupLocation?.name || 'Campus Gate',
        },
        destination: {
          lat: r.destinationLocation?.coordinates?.[1] || 17.4000,
          lng: r.destinationLocation?.coordinates?.[0] || 78.5000,
          name: r.destinationLocation?.name || 'Academic Block',
        },
        desired_time: r.departureTime || '09:00',
        seats_requested: r.seatsRequested || 1,
        gender: r.gender || 'ANY',
        female_only_required: Boolean(r.femaleOnlyRequired),
      }))
    }

    const result = await pythonOptimizerService.clusterRequests(requestsToCluster, eps_km, min_samples)
    return reply.send({ success: true, ...result })
  })

  // 5-Factor Weighted Ride Matching
  fastify.post('/match', async (request: any, reply) => {
    const { request: riderReq, candidate_rides: candidateRides, min_score_threshold } = request.body || {}
    if (!riderReq) {
      return reply.status(400).send({ success: false, message: 'Missing rider request payload' })
    }

    let rides = candidateRides
    if (!rides || rides.length === 0) {
      const dbRides = await RideModel.find({
        status: { $in: ['waiting', 'boarding', 'in_progress'] },
      }).limit(15)

      rides = dbRides.map((r: any) => ({
        id: r._id.toString(),
        vehicle_id: r.vehicleId?.toString() || 'veh-default',
        driver_id: r.driverId?.toString() || '',
        driver_name: r.driverName || 'Rahul Kumar',
        current_location: {
          lat: r.currentLocation?.coordinates?.[1] || r.pickupLocation?.coordinates?.[1] || 17.3850,
          lng: r.currentLocation?.coordinates?.[0] || r.pickupLocation?.coordinates?.[0] || 78.4867,
          name: r.pickupLocation?.name || 'Current Spot',
        },
        destination: {
          lat: r.destinationLocation?.coordinates?.[1] || 17.4000,
          lng: r.destinationLocation?.coordinates?.[0] || 78.5000,
          name: r.destinationLocation?.name || 'Destination',
        },
        route_coordinates: r.routeCoordinates || [],
        stops: r.stops || [],
        booked_seats: r.bookedSeats || 0,
        total_capacity: r.totalSeats || 4,
        departure_time: r.departureTime || '09:00',
        is_female_only: Boolean(r.isFemaleOnly),
      }))
    }

    const result = await pythonOptimizerService.matchRequest(riderReq, rides, min_score_threshold)
    return reply.send({ success: true, ...result })
  })

  // Network Optimization Preview (OR-Tools VRP)
  fastify.get('/network-preview', async (request: any, reply) => {
    // 1. Fetch pending requests
    const dbReqs = await RideRequestModel.find({ status: { $in: ['pending', 'searching'] } }).limit(25)
    // 2. Fetch available vehicles
    const dbVehicles = await VehicleModel.find({ status: { $in: ['AVAILABLE', 'ASSIGNED'] } }).limit(8)

    // If database has fewer than 2 requests, generate realistic campus demo requests
    let reqsPayload = dbReqs.map((r: any) => ({
      id: r._id.toString(),
      student_id: r.studentId,
      pickup: {
        lat: r.pickupLocation?.coordinates?.[1] || 17.3850,
        lng: r.pickupLocation?.coordinates?.[0] || 78.4867,
        name: r.pickupLocation?.name || 'Hostel Hub',
      },
      destination: {
        lat: r.destinationLocation?.coordinates?.[1] || 17.4000,
        lng: r.destinationLocation?.coordinates?.[0] || 78.5000,
        name: r.destinationLocation?.name || 'Campus Gate',
      },
      desired_time: r.departureTime || '09:00',
      seats_requested: r.seatsRequested || 1,
      gender: r.gender || 'ANY',
      female_only_required: Boolean(r.femaleOnlyRequired),
    }))

    if (reqsPayload.length < 3) {
      // Seed sample unassigned requests for preview demonstration
      const sampleSpots = [
        { pName: 'Hostel Block A', pLat: 17.3850, pLng: 78.4867, dName: 'Engineering Block', dLat: 17.4010, dLng: 78.5020 },
        { pName: 'Hostel Block B', pLat: 17.3860, pLng: 78.4875, dName: 'Central Library', dLat: 17.3995, dLng: 78.5015 },
        { pName: 'Hostel Block C', pLat: 17.3855, pLng: 78.4862, dName: 'Engineering Block', dLat: 17.4015, dLng: 78.5025 },
        { pName: 'Metro Feeder Station', pLat: 17.3780, pLng: 78.4750, dName: 'Admin Complex', dLat: 17.4050, dLng: 78.5100 },
        { pName: 'Metro Feeder Station', pLat: 17.3785, pLng: 78.4755, dName: 'Central Library', dLat: 17.3990, dLng: 78.5010 },
        { pName: 'Sports Complex', pLat: 17.3910, pLng: 78.4910, dName: 'Main Campus Gate', dLat: 17.4100, dLng: 78.5150 },
      ]
      reqsPayload = sampleSpots.map((s, idx) => ({
        id: `sim-req-${idx + 1}`,
        student_id: `student-${idx + 1}`,
        pickup: { lat: s.pLat, lng: s.pLng, name: s.pName },
        destination: { lat: s.dLat, lng: s.dLng, name: s.dName },
        desired_time: '09:00',
        seats_requested: 1,
        gender: 'ANY',
        female_only_required: false,
      }))
    }

    let vehiclesPayload = dbVehicles.map((v: any) => ({
      id: v._id.toString(),
      name: `${v.make} ${v.model} (${v.plateNumber})`,
      current_location: {
        lat: v.currentLocation?.coordinates?.[1] || 17.3840,
        lng: v.currentLocation?.coordinates?.[0] || 78.4850,
        name: 'Depot / Transit Hub',
      },
      capacity: v.capacity || 4,
      available_seats: v.capacity || 4,
      is_active: v.status !== 'OFFLINE',
    }))

    if (vehiclesPayload.length === 0) {
      vehiclesPayload = [
        {
          id: 'sim-van-1',
          name: 'Campus Shuttle Van #1 (TS 09 UA 1101)',
          current_location: { lat: 17.3840, lng: 78.4850, name: 'Hostel Depot' },
          capacity: 5,
          available_seats: 5,
          is_active: true,
        },
        {
          id: 'sim-van-2',
          name: 'Campus Shuttle Van #2 (TS 09 UA 1102)',
          current_location: { lat: 17.3780, lng: 78.4740, name: 'Metro Depot' },
          capacity: 5,
          available_seats: 5,
          is_active: true,
        },
      ]
    }

    const optimizationResult = await pythonOptimizerService.optimizeDispatch(reqsPayload, vehiclesPayload)

    return reply.send({
      success: true,
      data: {
        ...optimizationResult,
        input_summary: {
          total_pending_requests: reqsPayload.length,
          fleet_vehicles_available: vehiclesPayload.length,
        },
      },
    })
  })

  // Apply Network Optimization to Production Database
  fastify.post('/apply-network', async (request: any, reply) => {
    const { assignments, dispatcher_id } = request.body || {}
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return reply.status(400).send({ success: false, message: 'No assignments to apply' })
    }

    const createdRideIds: string[] = []
    const usedDriverIds: string[] = []
    const usedVehicleIds: string[] = []

    for (const assignment of assignments) {
      // Find or assign a distinct driver & vehicle for each trip
      const allocation = await tripGroupingService.findAvailableDriverAndVehicle(usedDriverIds, usedVehicleIds)
      const assignedDriver = allocation?.driver
      const assignedVehicle = allocation?.vehicle

      if (assignedDriver) usedDriverIds.push(assignedDriver.id)
      if (assignedVehicle) usedVehicleIds.push(assignedVehicle.id)

      const driverId = assignedDriver?.id || 'd1'
      const driverName = assignedDriver?.name || 'Rahul Kumar'
      const driverPhone = assignedDriver?.phone || '+91 99887 76655'
      const driverRating = assignedDriver?.rating || 4.8

      const vehicleId = assignment.vehicle_id || assignedVehicle?.id || 'v1'
      const vehicleName = assignment.vehicle_name || assignedVehicle?.name || 'Campus Shuttle'
      const vehiclePlate = assignment.vehicle_name?.split('(')[1]?.replace(')', '') || assignedVehicle?.registrationNumber || 'TS 09 AB 1234'

      const stops = (assignment.stops || []).map((s: any) => ({
        locationName: s.location?.name || `${s.stop_type.toUpperCase()} Stop`,
        coordinates: [s.location?.lng, s.location?.lat],
        type: s.stop_type,
        etaMinutes: s.eta_minutes || 0,
      }))

      const firstStop = stops[0]
      const lastStop = stops[stops.length - 1]

      const ride = await RideModel.create({
        driverId,
        driverName,
        driverPhone,
        driverRating,
        vehicleId,
        vehicleName,
        vehiclePlate,
        pickupLocation: {
          name: firstStop?.locationName || 'Campus Hub',
          coordinates: firstStop?.coordinates || [78.4850, 17.3840],
        },
        destinationLocation: {
          name: lastStop?.locationName || 'Academic Block',
          coordinates: lastStop?.coordinates || [78.5050, 17.4050],
        },
        routeCoordinates: assignment.route_geometry || [],
        totalSeats: 5,
        bookedSeats: assignment.assigned_request_ids?.length || 1,
        status: 'waiting',
        departureTime: 'Immediate (Optimized Batch)',
        pricePerSeat: 15,
        stops,
        notes: `AI Optimized pooled ride. OR-Tools PDP sequence: ${assignment.assigned_request_ids?.length || 0} passengers.`,
      })

      createdRideIds.push(ride._id.toString())

      // Update vehicle status
      if (assignment.vehicle_id && !assignment.vehicle_id.startsWith('sim-')) {
        await VehicleModel.findByIdAndUpdate(assignment.vehicle_id, {
          status: 'ASSIGNED',
          currentRideId: ride._id.toString(),
        })
      }
    }

    // Save Audit Trail
    await AuditLogModel.create({
      id: `audit-${Date.now()}`,
      dispatcherId: dispatcher_id || 'dispatcher-system',
      action: 'APPLY_NETWORK_OPTIMIZATION',
      targetType: 'RIDE',
      targetId: createdRideIds.join(','),
      metadata: {
        vehiclesDeployed: assignments.length,
        createdRideIds,
      },
      timestamp: new Date(),
    })

    // Central Notification: Network Optimization Applied
    await notificationService.notifyRideEvent('NETWORK_OPTIMIZED', {
      createdRideCount: createdRideIds.length,
      metadata: { createdRideIds, vehiclesDeployed: assignments.length },
    })

    // Broadcast Realtime Event
    realtimeService.broadcast('NETWORK_OPTIMIZED' as any, {
      createdRideIds,
      vehiclesDeployed: assignments.length,
      timestamp: new Date().toISOString(),
    })

    return reply.send({
      success: true,
      message: `Successfully applied network optimization: created ${createdRideIds.length} coordinated rides`,
      created_ride_ids: createdRideIds,
    })
  })

  // Scikit-Learn Demand Forecast (24 Hours Curve)
  fastify.get('/demand-forecast', async (request: any, reply) => {
    const { zone = 'Main Campus Gate' } = request.query as any
    const now = new Date()
    const currentDow = now.getDay() // 0=Sunday
    const pythonDow = currentDow === 0 ? 6 : currentDow - 1 // convert to 0=Mon, 6=Sun

    const hourlyPredictions = []
    for (let h = 0; h < 24; h++) {
      const pred = await pythonOptimizerService.predictDemand(zone, pythonDow, h, 0)
      hourlyPredictions.push({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        predicted_demand: pred.predicted_demand_count,
        surge_multiplier: pred.surge_multiplier,
        is_peak_hour: pred.is_peak_hour,
        recommended_vehicles: pred.recommended_vehicles,
      })
    }

    const currentHour = now.getHours()
    const currentPrediction = hourlyPredictions[currentHour] || hourlyPredictions[0]

    return reply.send({
      success: true,
      zone,
      current: currentPrediction,
      forecast_curve: hourlyPredictions,
      timestamp: now.toISOString(),
    })
  })

  // Benchmark API
  fastify.get('/benchmark', async () => {
    const benchmarkData = await pythonOptimizerService.getBenchmark()
    return {
      success: true,
      ...benchmarkData,
    }
  })
}
