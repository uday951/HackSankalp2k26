import { create } from 'zustand'
import type {
  Student,
  Driver,
  Ride,
  Booking,
  Notification,
  SafetyEvent,
  AdminUser,
  Vehicle,
  EmergencyContact,
} from '../types'
import { api } from '../services/api'
import { sosAlarmPlayer } from '../utils/alarmSound'
import { resolveDriverInfo } from '../utils/driverDirectory'

import { showNotificationToast } from '../components/notifications/NotificationToast'

export interface RideMessage {
  id: string
  rideId: string
  fromId: string
  fromName: string
  fromRole: 'student' | 'driver'
  text: string
  sentAt: string
  read: boolean
}

type Role = 'student' | 'faculty' | 'driver' | 'admin'

export function normalizeSafetyEvent(e: any): SafetyEvent {
  if (!e) return e
  const rawType = e.eventType || e.type || 'OTHER'
  const rawSeverity = e.severity || 'CRITICAL'
  const rawMsg = e.message || e.description || 'Safety incident reported'
  const rawCreatedAt = e.createdAt || e.timestamp || new Date().toISOString()

  return {
    id: e.id || e._id || `se-${Date.now()}`,
    rideId: e.rideId || '',
    type: String(rawType).toLowerCase(),
    eventType: String(rawType).toUpperCase(),
    message: rawMsg,
    description: rawMsg,
    severity: String(rawSeverity).toUpperCase(),
    createdAt: typeof rawCreatedAt === 'string' ? rawCreatedAt : new Date(rawCreatedAt).toISOString(),
    timestamp: rawCreatedAt,
    resolved: Boolean(e.resolved || e.status === 'RESOLVED'),
    resolvedAt: e.resolvedAt,
    resolvedBy: e.resolvedBy,
    userId: e.userId,
    userName: e.userName,
    userRole: e.userRole,
    userPhone: e.userPhone,
    vehicleId: e.vehicleId,
    driverId: e.driverId,
    driverName: e.driverName,
    routeName: typeof e.routeName === 'string' ? e.routeName.replace(/\s*\[?hackathon[^\]]*\]?/gi, '').trim() : e.routeName,
    passengerCount: e.passengerCount,
    emergencyContact: e.emergencyContact,
    acknowledgedAt: e.acknowledgedAt,
    acknowledgedBy: e.acknowledgedBy,
    smsStatus: e.smsStatus,
    smsMessage: e.smsMessage,
    lat: e.lat,
    lng: e.lng,
    status: e.status || (e.resolved ? 'RESOLVED' : 'ACTIVE'),
  } as SafetyEvent
}

export function normalizeRide(r: Ride): Ride {
  if (!r) return r
  let cleanName = r.routeName
  if (typeof cleanName === 'string') {
    cleanName = cleanName.replace(/\s*\[?hackathon[^\]]*\]?/gi, '').trim()
    cleanName = cleanName
      .replace(/Hostel A/g, 'Sri Indu Boys Hostel')
      .replace(/Hostel B/g, 'Sri Indu Girls Hostel')
      .replace(/Hostel C/g, 'Campus Transit Terminal')
    const arrowParts = cleanName.split('→').map((s) => s.trim())
    if (arrowParts.length === 2 && arrowParts[0].toLowerCase() === arrowParts[1].toLowerCase()) {
      cleanName = `${arrowParts[0]} → SRI INDU College`
    }
  }
  let cleanDest = r.destination
  if (typeof cleanDest === 'string') {
    cleanDest = cleanDest
      .replace(/Hostel A/g, 'Sri Indu Boys Hostel')
      .replace(/Hostel B/g, 'Sri Indu Girls Hostel')
      .replace(/Hostel C/g, 'Campus Transit Terminal')
  }

  // Resolve real institutional driver & vehicle details
  const driverInfo = resolveDriverInfo(r.driverId, (r as any).driverName)
  const resolvedDriverName = (r as any).driverName && !(r as any).driverName.toLowerCase().includes('campus driver')
    ? (r as any).driverName
    : driverInfo.name
  const resolvedDriverPhone = (r as any).driverPhone || driverInfo.phone
  const resolvedDriverRating = (r as any).driverRating || driverInfo.rating
  const resolvedDriverAvatar = (r as any).driverAvatar || driverInfo.avatar
  const resolvedVehicleName = (r as any).vehicleName || driverInfo.vehicleName
  const resolvedVehiclePlate = (r as any).vehiclePlate || driverInfo.vehicleRegistration

  return {
    ...r,
    routeName: cleanName || 'Campus Shuttle',
    destination: cleanDest || 'SRI INDU College',
    driverName: resolvedDriverName,
    driverPhone: resolvedDriverPhone,
    driverRating: resolvedDriverRating,
    driverAvatar: resolvedDriverAvatar,
    vehicleName: resolvedVehicleName,
    vehiclePlate: resolvedVehiclePlate,
  }
}

interface SimState {
  trafficActive: boolean
  demoMessage: string | null
}

interface AppState {
  // Auth
  role: Role
  token: string | null
  currentUser: any | null
  currentStudentId: string
  currentDriverId: string
  backendReady: boolean
  emergencyContact: EmergencyContact | null

  // Data
  students: Student[]
  drivers: Driver[]
  vehicles: Vehicle[]
  rides: Ride[]
  bookings: Booking[]
  notifications: Notification[]
  safetyEvents: SafetyEvent[]
  adminUser: AdminUser
  auditLogs: any[]
  messages: RideMessage[]

  // Simulation
  sim: SimState

  // Computed helpers
  currentStudent: () => Student | undefined
  currentDriver: () => Driver | undefined

  // Lifecycle
  initBackend: () => Promise<void>

  // Actions — Auth
  setRole: (role: Role) => void
  loginAsStudent: (studentId: string) => void
  loginAsDriver: (driverId: string) => void
  login: (credentials: { email?: string; username?: string; phone?: string; password?: string; otp?: string; code?: string; role?: string; userId?: string }) => Promise<{ success: boolean; role: Role; user: any }>
  registerStudent: (data: any) => Promise<{ user: any; token: string; ocrResult: any }>
  registerFaculty: (data: any) => Promise<{ user: any; token: string; ocrResult: any }>
  registerDriver: (data: any) => Promise<{ user: any; token: string; ocrResult: any }>
  logout: () => void

  joinRide: (rideId: string, studentId: string, pickup: string, destination: string, pickupCoords?: { lat: number; lng: number }, destinationCoords?: { lat: number; lng: number }, pickupAddress?: string, destinationAddress?: string, genderPreference?: string) => Promise<Booking | null>
  createRide: (
    pickup: string,
    destination: string,
    time: string,
    seats: number,
    studentId: string,
    pickupCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number },
    genderPreference?: string
  ) => Promise<Ride>
  cancelBooking: (bookingId: string) => Promise<void>

  // Actions — Driver
  acceptRide: (rideId: string) => Promise<void>
  startRide: (rideId: string, startLocation?: { name?: string; lat: number; lng: number }) => Promise<void>
  createAndActivateRide: (payload: {
    startLocation: { name: string; lat: number; lng: number; address?: string }
    destination?: string
    destinationLat?: number
    destinationLng?: number
  }) => Promise<Ride>
  completeRide: (rideId: string) => Promise<void>
  refreshRides: () => Promise<void>
  updatePassengerStatus: (rideId: string, studentId: string, status: 'boarded' | 'dropped') => Promise<void>

  // Actions — Dispatcher
  loadDispatcherData: () => Promise<any>
  reassignDriver: (rideId: string, driverId: string) => Promise<void>
  reassignVehicle: (rideId: string, vehicleId: string) => Promise<void>
  cancelRideByDispatcher: (rideId: string, reason?: string) => Promise<void>
  recalculateRideRoute: (rideId: string) => Promise<void>
  resolveSafetyEvent: (eventId: string) => Promise<void>
  resetScheduledFleet: () => Promise<any>
  loadAuditLog: () => Promise<void>

  // Actions — Safety
  triggerSOS: (params?: { rideId?: string; userId?: string; lat?: number; lng?: number; emergencyPhone?: string; emergencyName?: string } | string, studentId?: string) => Promise<any>
  acknowledgeSafetyEvent: (eventId: string) => Promise<void>
  triggerDeviation: (rideId: string) => Promise<void>
  resolveDeviation: (rideId: string, eventId: string) => Promise<void>
  setEmergencyContact: (contact: EmergencyContact | null) => void
  loadEmergencyContact: () => Promise<EmergencyContact | null>

  // Actions — Messaging
  sendMessage: (rideId: string, text: string, driverId?: string, bookingId?: string) => Promise<void>
  replyToMessage: (rideId: string, text: string, studentId?: string, bookingId?: string) => Promise<void>
  markMessagesRead: (rideId: string, role: 'student' | 'driver') => Promise<void>
  fetchRideMessages: (rideId: string) => Promise<void>

  // Actions — Notifications
  fetchNotifications: () => Promise<void>
  markNotificationRead: (notifId: string) => Promise<void>
  markAllRead: () => Promise<void>
  addNotification: (n: Omit<Notification, 'id' | 'createdAt'>) => void

  // Actions — Demo Controls (backed by real MongoDB API)
  fillNextSeat: (rideId?: string) => Promise<void>
  cancelPassenger: (rideId?: string) => Promise<void>
  addStudentRequest: () => Promise<void>
  simulateTraffic: () => Promise<void>
  resetDemo: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial State — empty; populated by initBackend() from real MongoDB
  role: (localStorage.getItem('campusflow_role') as Role) || 'student',
  token: localStorage.getItem('campusflow_token') || null,
  currentUser: null,
  currentStudentId: localStorage.getItem('campusflow_user_id') || '',
  currentDriverId: localStorage.getItem('campusflow_driver_id') || '',
  backendReady: false,
  emergencyContact: null,
  students: [],
  drivers: [],
  vehicles: [],
  rides: [],
  bookings: [],
  notifications: [],
  safetyEvents: [],
  adminUser: { id: 'admin1', name: 'Dispatch Control', role: 'admin', avatar: 'DC' },
  auditLogs: [],
  messages: [],
  sim: { trafficActive: false, demoMessage: null },

  // Computed — prefer currentUser (real authenticated user) over store list
  currentStudent: () => {
    const cu = get().currentUser
    if (cu && (cu.role === 'student' || cu.role === 'STUDENT' || cu.role === 'faculty' || cu.role === 'FACULTY')) return cu as any
    return get().students.find((s) => s.id === get().currentStudentId)
  },
  currentDriver: () => {
    const cu = get().currentUser
    if (cu && (cu.role === 'driver' || cu.role === 'DRIVER')) return cu as any
    return get().drivers.find((d) => d.id === get().currentDriverId)
  },

  // Bootstrap backend data & setup WebSocket stream
  initBackend: async () => {
    try {
      api.setAuth(get().currentStudentId, get().currentDriverId, get().token)
      api.initWebSocket()

      // Listen to real-time events from Fastify backend
      api.onRealtimeEvent((event, payload) => {
        if ((event === 'NOTIFICATION_ADDED' || event === 'RIDE_MESSAGE') && payload) {
          const notif = payload.notification || payload.message || payload
          if (notif && (notif.id || notif._id)) {
            const notifId = notif.id || notif._id
            // 1. Save notification to persist in notification history & update unread badges
            set((state) => ({
              notifications: [{ ...notif, id: notifId }, ...state.notifications.filter((n) => n.id !== notifId)],
            }))

            // If it's a ride message, also push into messages state for live chat
            if ((notif.type === 'message' || notif.eventType === 'RIDE_MESSAGE') && notif.rideId) {
              const senderRole = (notif.metadata?.senderRole || (notif.role === 'student' ? 'driver' : 'student')) as 'student' | 'driver'
              const senderName = notif.metadata?.senderName || (senderRole === 'driver' ? 'Driver' : 'Student')
              const msg: RideMessage = {
                id: notifId,
                rideId: notif.rideId,
                fromId: notif.metadata?.senderId || (senderRole === 'driver' ? notif.driverId : notif.studentId) || '',
                fromName: senderName,
                fromRole: senderRole,
                text: notif.message,
                sentAt: notif.createdAt || new Date().toISOString(),
                read: Boolean(notif.read),
              }
              set((state) => {
                const existingWithoutThis = state.messages.filter(
                  (m) => m.id !== msg.id && !(m.id.startsWith('temp-') && m.text === msg.text && m.rideId === msg.rideId)
                )
                return {
                  messages: [...existingWithoutThis, msg],
                }
              })
            }

            // 2. Determine if the active user should receive a real-time toast popup
            const currentState = get()
            const activeRole = (currentState.role || 'student').toLowerCase()
            const currentStudentId = currentState.currentStudentId || currentState.currentUser?.id
            const currentDriverId = currentState.currentDriverId || currentState.currentUser?.id

            const targetUserId = notif.userId
            const targetStudentId = notif.studentId
            const targetDriverId = notif.driverId
            const notifRole = (notif.role || '').toLowerCase()

            let isRelevant = false
            if (activeRole === 'admin' || activeRole === 'dispatcher') {
              // Dispatcher is the global operations center — receives all operational events
              isRelevant = true
            } else if (activeRole === 'driver') {
              // Driver receives events for their assigned vehicle/rides/passengers
              isRelevant =
                Boolean(targetDriverId && targetDriverId === currentDriverId) ||
                Boolean(targetUserId && targetUserId === currentDriverId) ||
                notifRole === 'driver' ||
                notifRole === 'all'
            } else if (activeRole === 'student' || activeRole === 'faculty') {
              // Student/Faculty receives events strictly for their own rides
              isRelevant =
                Boolean(targetStudentId && targetStudentId === currentStudentId) ||
                Boolean(targetUserId && targetUserId === currentStudentId) ||
                notifRole === 'student' ||
                notifRole === 'faculty' ||
                notifRole === 'all'
            }

            if (isRelevant) {
              showNotificationToast(notif)
            }
          }
        } else if ((event === 'RIDE_UPDATED' || event === 'RIDE_CREATED' || event === 'RIDE_STARTED' || event === 'RIDE_COMPLETED' || event === 'RIDE_CANCELLED' || event === 'DRIVER_ACCEPTED' || event === 'DRIVER_REASSIGNED' || event === 'VEHICLE_REASSIGNED' || event === 'ROUTE_UPDATED' || event === 'TRIP_CREATED' || event === 'TRIP_ROUTE_UPDATED') && (payload?.ride || payload?.trip)) {
          const rawTrip = payload.ride || payload.trip
          const isCompleted = event === 'RIDE_COMPLETED' || rawTrip.status === 'completed'
          const normRide = normalizeRide(rawTrip)
          set((state) => ({
            rides: state.rides.some((r) => r.id === normRide.id)
              ? state.rides.map((r) => (r.id === normRide.id ? { ...r, ...normRide } : r))
              : [normRide, ...state.rides],
            ...(isCompleted
              ? {
                  bookings: state.bookings.map((b) =>
                    b.rideId === normRide.id ? { ...b, status: 'completed' as const } : b
                  ),
                }
              : {}),
          }))
        } else if (event === 'PASSENGER_JOINED_TRIP' && payload?.tripId && payload?.passenger) {
          set((state) => ({
            rides: state.rides.map((r) => {
              if (r.id === payload.tripId) {
                const passengers = r.passengers || []
                const hasPax = passengers.some((p) => p.studentId === payload.passenger.studentId)
                return {
                  ...r,
                  bookedSeats: payload.bookedSeats ?? r.bookedSeats + 1,
                  passengers: hasPax ? passengers : [...passengers, payload.passenger],
                }
              }
              return r
            }),
          }))
        } else if (event === 'PASSENGER_REMOVED_FROM_TRIP' && payload?.tripId && payload?.studentId) {
          set((state) => ({
            rides: state.rides.map((r) => {
              if (r.id === payload.tripId) {
                return {
                  ...r,
                  bookedSeats: payload.bookedSeats ?? Math.max(0, r.bookedSeats - 1),
                  passengers: (r.passengers || []).filter((p) => p.studentId !== payload.studentId),
                }
              }
              return r
            }),
          }))
        } else if (event === 'BOOKING_CREATED') {
          if (payload?.booking) {
            set((state) => ({
              bookings: [payload.booking, ...state.bookings.filter((b) => b.id !== payload.booking.id)],
            }))
          }
          if (payload?.ride) {
            const normRide = normalizeRide(payload.ride)
            set((state) => ({
              rides: state.rides.some((r) => r.id === normRide.id)
                ? state.rides.map((r) => (r.id === normRide.id ? { ...r, ...normRide } : r))
                : [normRide, ...state.rides],
            }))
          }
        } else if (event === 'BOOKING_UPDATED') {
          if (payload?.booking) {
            set((state) => ({
              bookings: state.bookings.map((b) => (b.id === payload.booking.id ? { ...b, ...payload.booking } : b)),
            }))
          } else if (payload?.rideId && payload?.status) {
            set((state) => ({
              bookings: state.bookings.map((b) =>
                b.rideId === payload.rideId ? { ...b, status: payload.status as any } : b
              ),
            }))
          }
        } else if (event === 'BOOKING_CANCELLED') {
          if (payload?.bookingId) {
            set((state) => ({
              bookings: state.bookings.map((b) => (b.id === payload.bookingId ? { ...b, status: 'cancelled' as const } : b)),
            }))
          }
          if (payload?.ride) {
            set((state) => ({
              rides: state.rides.map((r) => (r.id === payload.ride.id ? { ...r, ...payload.ride } : r)),
            }))
          }
        } else if (
          event === 'SAFETY_ALERT' ||
          event === 'SAFETY_ALERT_CREATED' ||
          event === 'SOS_CREATED' ||
          event === 'STUDENT_SOS_TRIGGERED' ||
          event === 'DRIVER_SOS_TRIGGERED' ||
          event === 'SOS_TRIGGERED'
        ) {
          const rawEvent = payload?.safetyEvent || payload?.event || payload
          const eventStatus = payload?.status || rawEvent?.status
          const isAckOrResolved =
            eventStatus === 'ACKNOWLEDGED' ||
            eventStatus === 'RESOLVED' ||
            rawEvent?.status === 'ACKNOWLEDGED' ||
            rawEvent?.status === 'RESOLVED' ||
            rawEvent?.resolved === true

          if (isAckOrResolved) {
            sosAlarmPlayer.stop()
          }

          if (payload?.safetyEvent) {
            const normalized = normalizeSafetyEvent(payload.safetyEvent)
            set((state) => ({
              safetyEvents: [normalized, ...state.safetyEvents.filter((e) => e.id !== normalized.id)],
            }))
            // Siren alarm must ONLY sound in Dispatcher Portal for a new,
            // unacknowledged, unresolved SOS event. Never in Student or Driver Portal.
            const currentRole = (get().role || '').toLowerCase()
            const currentUserRole = (get().currentUser?.role || '').toLowerCase()
            const isDispatcher =
              currentRole === 'admin' ||
              currentRole === 'dispatcher' ||
              currentUserRole === 'admin' ||
              currentUserRole === 'dispatcher' ||
              (typeof window !== 'undefined' &&
                (window.location.hash.startsWith('#/admin') ||
                  window.location.pathname.startsWith('/admin') ||
                  window.location.pathname.startsWith('/dispatcher')))

            const isUnacknowledgedSos =
              !isAckOrResolved &&
              normalized.status !== 'ACKNOWLEDGED' &&
              normalized.status !== 'RESOLVED' &&
              !normalized.resolved &&
              (normalized.eventType === 'SOS' ||
                normalized.eventType === 'STUDENT_SOS_TRIGGERED' ||
                normalized.eventType === 'DRIVER_SOS_TRIGGERED' ||
                (normalized.type && normalized.type.includes('SOS')))

            if (isDispatcher && isUnacknowledgedSos && normalized.id) {
              // Play only once for this event to prevent duplicate sirens from repeated realtime events.
              sosAlarmPlayer.playOnceForEvent(normalized.id).catch(() => {})
            } else {
              sosAlarmPlayer.stop()
            }
          }
          if (payload?.ride) {
            set((state) => ({
              rides: state.rides.map((r) => (r.id === payload.ride.id ? { ...r, ...payload.ride, hasSosAlert: !isAckOrResolved } : r)),
            }))
          }
        } else if (
          event === 'SAFETY_EVENT_ACKNOWLEDGED' ||
          event === 'SOS_ACKNOWLEDGED'
        ) {
          sosAlarmPlayer.stop()
          const rawEvent = payload?.safetyEvent || payload?.event || payload
          if (rawEvent?.id) {
            const normalized = normalizeSafetyEvent(rawEvent)
            set((state) => ({
              safetyEvents: state.safetyEvents.map((e) => (e.id === normalized.id ? { ...e, ...normalized, status: 'ACKNOWLEDGED' } : e)),
            }))
          }
        } else if (
          event === 'SAFETY_EVENT_RESOLVED' ||
          event === 'SOS_RESOLVED'
        ) {
          sosAlarmPlayer.stop()
          const rawEvent = payload?.safetyEvent || payload?.event || payload
          if (rawEvent?.id) {
            const normalized = normalizeSafetyEvent(rawEvent)
            set((state) => ({
              safetyEvents: state.safetyEvents.map((e) => (e.id === normalized.id ? { ...e, ...normalized, resolved: true, status: 'RESOLVED' } : e)),
              rides: state.rides.map((r) =>
                normalized.rideId && r.id === normalized.rideId ? { ...r, hasSosAlert: false, hasDeviation: false } : r
              ),
            }))
          }
        } else if (event === 'VEHICLE_LOCATION_UPDATED') {
          if (payload?.rideId && payload?.lat && payload?.lng) {
            set((state) => ({
              rides: state.rides.map((r) =>
                r.id === payload.rideId
                  ? {
                      ...r,
                      currentLat: payload.lat,
                      currentLng: payload.lng,
                      estimatedArrival: payload.progress?.etaString || r.estimatedArrival,
                    }
                  : r
              ),
              vehicles: state.vehicles.map((v) =>
                v.id === payload.vehicleId
                  ? {
                      ...v,
                      currentLat: payload.lat,
                      currentLng: payload.lng,
                      heading: payload.heading ?? v.heading,
                      speed: payload.speed ?? v.speed,
                    }
                  : v
              ),
            }))
          }
        } else if (event === 'STOP_UPDATED') {
          if (payload?.rideId && payload?.stop) {
            set((state) => ({
              rides: state.rides.map((r) => {
                if (r.id !== payload.rideId) return r
                const updatedStops = (r.stops || []).map((s) =>
                  s.id === payload.stop.id ? { ...s, ...payload.stop } : s
                )
                return { ...r, stops: updatedStops }
              }),
            }))
          }
        } else if (event === 'ROUTE_UPDATED') {
          if (payload?.rideId && payload?.route) {
            set((state) => ({
              rides: state.rides.map((r) =>
                r.id === payload.rideId
                  ? {
                      ...r,
                      tripRoute: payload.route,
                      stops: payload.stops || r.stops,
                      routeCoordinates: payload.route.geometry || r.routeCoordinates,
                    }
                  : r
              ),
            }))
          }
        } else if (event === 'VEHICLE_BREAKDOWN') {
          if (payload?.vehicleId) {
            set((state) => ({
              vehicles: state.vehicles.map((v) =>
                v.id === payload.vehicleId ? { ...v, status: 'OUT_OF_SERVICE' as any } : v
              ),
              rides: payload.rideId
                ? state.rides.map((r) =>
                    r.id === payload.rideId ? { ...r, status: 'recovery_pending' as any } : r
                  )
                : state.rides,
            }))
          }
        } else if (event === 'RECOVERY_COMPLETED') {
          if (payload?.rideId) {
            set((state) => ({
              rides: state.rides.map((r) =>
                r.id === payload.rideId
                  ? {
                      ...r,
                      vehicleId: payload.replacementVehicleId || r.vehicleId,
                      driverId: payload.replacementDriverId || r.driverId,
                      status: 'active' as any,
                      routeCoordinates: payload.updatedRouteGeometry || r.routeCoordinates,
                    }
                  : r
              ),
              vehicles: state.vehicles.map((v) => {
                if (v.id === payload.oldVehicleId) return { ...v, status: 'OUT_OF_SERVICE' as any }
                if (v.id === payload.replacementVehicleId) return { ...v, status: 'ON_TRIP' as any }
                return v
              }),
            }))
            // Refresh rides & bookings to ensure 100% sync
            get().refreshRides()
          }
        } else if (event === 'RECOVERY_FAILED') {
          if (payload?.rideId) {
            set((state) => ({
              rides: state.rides.map((r) =>
                r.id === payload.rideId ? { ...r, status: 'recovery_pending' as any } : r
              ),
            }))
          }
        } else if (event === 'DEMO_RESET') {
          get().initBackend()
        }
      })

      // Fetch initial data from real MongoDB
      const currentStudentId = get().currentStudentId
      const [backendRides, backendEvents, backendNotifs, backendUsers, backendBookings, backendVehicles] = await Promise.all([
        api.getRides().catch(() => []),
        api.getSafetyEvents().catch(() => []),
        api.getNotifications().catch(() => []),
        api.getAllUsers().catch(() => []),
        (currentStudentId ? api.getUserBookings(currentStudentId).catch(() => []) : Promise.resolve([])),
        api.getVehicles().catch(() => []),
      ])

      const realStudents = (backendUsers || [])
        .filter((u: any) => u.role?.toUpperCase() === 'STUDENT' || u.role?.toUpperCase() === 'FACULTY')
        .map((u: any) => ({
          id: u.id,
          name: u.name,
          studentId: u.studentId || u.rollNumber || u.id,
          department: u.department || 'Engineering',
          year: u.year || 1,
          phone: u.phone || '',
          avatar: u.avatar || (u.name ? u.name.slice(0, 2).toUpperCase() : 'U'),
          rating: u.rating || 4.8,
          totalRides: u.totalRides || 0,
          verified: u.isVerified !== false && u.verificationStatus !== 'REJECTED',
          role: 'student' as const,
          email: u.email,
          collegeName: u.collegeName,
          rollNumber: u.rollNumber,
          gender: u.gender,
          verificationStatus: u.verificationStatus === 'REJECTED' ? 'REJECTED' : (u.verificationStatus || 'VERIFIED'),
          nameMatchStatus: u.nameMatchStatus || 'MATCHED',
        }))

      const realDrivers = (backendUsers || [])
        .filter((u: any) => u.role?.toUpperCase() === 'DRIVER')
        .map((u: any) => ({
          id: u.id,
          name: u.name,
          phone: u.phone || '',
          avatar: u.avatar || (u.name ? u.name.slice(0, 2).toUpperCase() : 'D'),
          rating: u.rating || 4.8,
          totalTrips: u.totalTrips || u.totalRides || 0,
          verified: u.isVerified !== false && u.verificationStatus !== 'REJECTED',
          licenseNo: u.licenseNumber || '',
          role: 'driver' as const,
          vehicleId: u.vehicleId || '',
          email: u.email,
          vehicleRegistration: u.vehicleRegistration,
          vehicleType: u.vehicleType,
          gender: u.gender,
          verificationStatus: u.verificationStatus === 'REJECTED' ? 'REJECTED' : (u.verificationStatus || 'VERIFIED'),
          nameMatchStatus: u.nameMatchStatus || 'MATCHED',
          driverType: (u.driverType === 'student' ? 'student' : 'regular') as 'regular' | 'student',
          studentId: u.studentId || u.rollNumber || '',
          rollNumber: u.rollNumber || '',
          availableDays: u.availableDays || [],
          availableTime: u.availableTime || '',
          preferredRoute: u.preferredRoute || '',
        }))

      set({
        rides: (backendRides || []).map(normalizeRide),
        safetyEvents: (backendEvents || []).map(normalizeSafetyEvent),
        notifications: backendNotifs || [],
        bookings: backendBookings || [],
        students: realStudents,
        drivers: realDrivers,
        vehicles: backendVehicles || [],
        backendReady: true,
      })

      // If user is logged in, fetch profile and update currentUser + ID fields
      if (get().token) {
        try {
          const profile = await api.getMe()
          if (profile) {
            const isDriver = profile.role?.toUpperCase() === 'DRIVER'
            const isStudent = profile.role?.toUpperCase() === 'STUDENT' || profile.role?.toUpperCase() === 'FACULTY'
            const activeDriverId = isDriver ? profile.id : (get().currentDriverId || 'd1')
            const activeStudentId = isStudent ? profile.id : get().currentStudentId
            api.setAuth(profile.id, activeDriverId, get().token)
            set({
              currentUser: profile,
              currentStudentId: activeStudentId,
              currentDriverId: activeDriverId,
              role: isDriver ? 'driver' : 'student',
            })
            // Fetch fresh notifications with authenticated credentials
            const freshNotifs = await api.getNotifications().catch(() => [])
            if (Array.isArray(freshNotifs)) {
              set({ notifications: freshNotifs })
            }
            const activeId = profile.id || (isStudent ? get().currentStudentId : get().currentDriverId)
            if (activeId) {
              api.getEmergencyContact(activeId).then((ec) => {
                if (ec) set({ emergencyContact: ec })
              }).catch(() => {})
            }
          }
        } catch {
          // token expired or invalid — don't overwrite
        }
      }
    } catch (err) {
      console.warn('[Store] Backend not yet connected:', err)
      set({ backendReady: true }) // mark ready even on failure so UI doesn't hang
    }
  },

  // Auth
  setRole: (role: Role) => {
    if (role !== 'admin') {
      sosAlarmPlayer.stop()
    }
    localStorage.setItem('campusflow_role', role)
    set({ role })
  },
  loginAsStudent: (studentId: string) => {
    sosAlarmPlayer.stop()
    localStorage.setItem('campusflow_user_id', studentId)
    localStorage.setItem('campusflow_role', 'student')
    api.setAuth(studentId, get().currentDriverId)
    set({ currentStudentId: studentId, role: 'student' })
  },
  loginAsDriver: (driverId: string) => {
    sosAlarmPlayer.stop()
    localStorage.setItem('campusflow_driver_id', driverId)
    localStorage.setItem('campusflow_role', 'driver')
    api.setAuth(get().currentStudentId, driverId)
    set({ currentDriverId: driverId, role: 'driver' })
  },
  login: async (credentials) => {
    try {
      const res = await api.login(credentials)
      const mappedRole: Role =
        res.role.toLowerCase() === 'admin' || res.role.toLowerCase() === 'dispatcher'
          ? 'admin'
          : (res.role.toLowerCase() as Role)

      localStorage.setItem('campusflow_role', mappedRole)
      localStorage.setItem('campusflow_token', res.token)
      if (res.user?.id) localStorage.setItem('campusflow_user_id', res.user.id)
      if (mappedRole === 'driver' && res.user?.id) localStorage.setItem('campusflow_driver_id', res.user.id)
      api.setAuth(res.user?.id || get().currentStudentId, mappedRole === 'driver' ? res.user?.id : get().currentDriverId, res.token)

      set({
        currentUser: res.user,
        token: res.token,
        role: mappedRole,
        currentStudentId: res.user?.id || get().currentStudentId,
        currentDriverId: mappedRole === 'driver' ? res.user?.id : get().currentDriverId,
      })

      get().fetchNotifications()
      if (res.user?.id) {
        api.getEmergencyContact(res.user.id).then((ec) => {
          if (ec) set({ emergencyContact: ec })
        }).catch(() => {})
      }

      return { success: true, role: mappedRole, user: res.user }
    } catch (err: any) {
      // If the backend responded with an error (e.g., 401 Incorrect password, 404 User not found), rethrow immediately!
      if (err.status || err.code || err.message?.includes('password') || err.message?.includes('account') || err.message?.includes('credentials')) {
        throw err
      }

      // Fallback only if backend server is completely offline / unreachable
      const reqRole = (credentials.role || '').toLowerCase()
      if (reqRole === 'driver') {
        const fallbackDriver =
          get().drivers.find(
            (d) =>
              d.email?.toLowerCase() === credentials.email?.toLowerCase() ||
              d.phone === credentials.phone ||
              d.id === credentials.userId ||
              d.email === 'rahul.kumar.driver@gmail.com'
          ) || get().drivers[0]

        if (fallbackDriver) {
          set({
            currentUser: fallbackDriver,
            currentDriverId: fallbackDriver.id,
            role: 'driver',
          })
          return { success: true, role: 'driver', user: fallbackDriver }
        }
      }

      const fallbackUser = get().students.find(
        (s) => s.email?.toLowerCase() === credentials.email?.toLowerCase() || s.id === credentials.userId
      )
      if (fallbackUser) {
        set({
          currentUser: fallbackUser,
          currentStudentId: fallbackUser.id,
          role: reqRole === 'faculty' ? 'faculty' : 'student',
        })
        return { success: true, role: reqRole === 'faculty' ? 'faculty' : 'student', user: fallbackUser }
      }
      throw err
    }
  },
  registerStudent: async (data) => {
    try {
      const res = await api.registerStudent(data)
      api.setAuth(res.user.id, get().currentDriverId, res.token)
      set((state) => ({
        students: [res.user, ...state.students],
        currentUser: res.user,
        currentStudentId: res.user.id,
        token: res.token,
        role: 'student',
      }))
      return res
    } catch (err: any) {
      console.error('[Store] registerStudent error:', err)
      const errorMsg = err.message || 'Cannot reach backend server on port 5000. Please ensure the backend is running.'
      throw new Error(errorMsg)
    }
  },
  registerFaculty: async (data) => {
    try {
      const res = await api.registerFaculty(data)
      api.setAuth(res.user.id, get().currentDriverId, res.token)
      set((state) => ({
        currentUser: res.user,
        currentStudentId: res.user.id,
        token: res.token,
        role: 'faculty',
      }))
      return res
    } catch (err: any) {
      console.error('[Store] registerFaculty error:', err)
      const errorMsg = err.message || 'Cannot reach backend server on port 5000. Please ensure the backend is running.'
      throw new Error(errorMsg)
    }
  },
  registerDriver: async (data) => {
    try {
      const res = await api.registerDriver(data)
      localStorage.setItem('campusflow_role', 'driver')
      localStorage.setItem('campusflow_token', res.token)
      if (res.user?.id) {
        localStorage.setItem('campusflow_user_id', res.user.id)
        localStorage.setItem('campusflow_driver_id', res.user.id)
      }
      api.setAuth(res.user.id, res.user.id, res.token)
      set((state) => ({
        drivers: [res.user, ...state.drivers],
        currentUser: res.user,
        currentDriverId: res.user.id,
        token: res.token,
        role: 'driver',
      }))
      get().fetchNotifications()
      return res
    } catch (err: any) {
      console.error('[Store] registerDriver error:', err)
      const errorMsg = err.message || 'Cannot reach backend server on port 5000. Please ensure the backend is running.'
      throw new Error(errorMsg)
    }
  },
  logout: () => {
    sosAlarmPlayer.stop()
    localStorage.removeItem('campusflow_token')
    localStorage.removeItem('campusflow_role')
    localStorage.removeItem('campusflow_user_id')
    localStorage.removeItem('campusflow_driver_id')
    api.setToken(null)
    set({
      token: null,
      currentUser: null,
      role: 'student',
      currentStudentId: '',
      currentDriverId: '',
      rides: [],
      bookings: [],
      notifications: [],
      safetyEvents: [],
    })
  },

  // Join Ride
  joinRide: async (
    rideId: string,
    studentId: string,
    pickup: string,
    destination: string,
    pickupCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number },
    pickupAddress?: string,
    destinationAddress?: string,
    genderPreference?: string
  ) => {
    try {
      const res = await api.joinRide(rideId, studentId, pickup, destination, 1, pickupCoords, destinationCoords, pickupAddress, destinationAddress, genderPreference)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === res.ride.id ? res.ride : r)),
        bookings: [res.booking, ...state.bookings],
      }))
      return res.booking
    } catch (err: any) {
      console.error('[Store] joinRide error:', err.message)
      throw err
    }
  },

  // Create Ride (routed through intelligent Trip Grouping & Booking Placement)
  createRide: async (
    pickup: string,
    destination: string,
    time: string,
    seats: number,
    studentId: string,
    pickupCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number },
    genderPreference?: string
  ) => {
    try {
      const pLat = pickupCoords?.lat || 17.398
      const pLng = pickupCoords?.lng || 78.479
      const dLat = destinationCoords?.lat || 17.387
      const dLng = destinationCoords?.lng || 78.486

      const response = await api.createBooking({
        studentId,
        pickup,
        pickupName: pickup,
        pickupCoords: { lat: pLat, lng: pLng },
        destination,
        destinationName: destination,
        destinationCoords: { lat: dLat, lng: dLng },
        time,
        seats,
        genderPreference: genderPreference || 'ANYONE',
      })

      const normRide = normalizeRide(response.trip)
      const booking = response.booking

      set((state) => {
        const rideExists = state.rides.some((r) => r.id === normRide.id)
        const updatedRides = rideExists
          ? state.rides.map((r) => (r.id === normRide.id ? { ...r, ...normRide } : r))
          : [normRide, ...state.rides]

        const updatedBookings = booking
          ? [booking, ...state.bookings.filter((b) => b.id !== booking.id)]
          : state.bookings

        return {
          rides: updatedRides,
          bookings: updatedBookings,
        }
      })

      return normRide
    } catch (err: any) {
      console.error('[Store] createRide error:', err.message)
      throw err
    }
  },

  // Cancel Booking
  cancelBooking: async (bookingId: string) => {
    const booking = get().bookings.find((b) => b.id === bookingId)
    if (!booking) return
    try {
      await api.cancelBooking(booking.rideId, booking.studentId)
      set((state) => ({
        bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' as const } : b)),
      }))
    } catch (err: any) {
      console.error('[Store] cancelBooking error:', err.message)
    }
  },

  // Driver Actions
  acceptRide: async (rideId: string) => {
    try {
      const updated = await api.acceptDriverRide(rideId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? updated : r)),
      }))
    } catch (err: any) {
      console.error('[Store] acceptRide error:', err.message)
    }
  },

  startRide: async (rideId: string, startLocation?: { name?: string; lat: number; lng: number }) => {
    try {
      const updated = await api.startRide(rideId, startLocation)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? updated : r)),
      }))
    } catch (err: any) {
      console.error('[Store] startRide error:', err.message)
      throw err
    }
  },

  createAndActivateRide: async (payload: {
    startLocation: { name: string; lat: number; lng: number; address?: string }
    destination?: string
    destinationLat?: number
    destinationLng?: number
  }) => {
    try {
      const cu = get().currentUser
      const driverId = get().currentDriverId || cu?.id || 'd1'
      const vehicle = get().vehicles.find((v) => v.driverId === driverId) || get().vehicles[0]
      const destName = payload.destination || 'SRI INDU Campus Main Gate'
      const destLat = payload.destinationLat || 17.2063
      const destLng = payload.destinationLng || 78.6015

      const newRide = await api.createRide({
        routeName: `Campus Route #${Math.floor(100 + Math.random() * 900)} [From ${payload.startLocation.name.split(',')[0].trim()}]`,
        driverId,
        vehicleId: vehicle?.id || 'v1',
        startLocation: payload.startLocation.name,
        startLocationLat: payload.startLocation.lat,
        startLocationLng: payload.startLocation.lng,
        currentLat: payload.startLocation.lat,
        currentLng: payload.startLocation.lng,
        destination: destName,
        destinationLat: destLat,
        destinationLng: destLng,
        departureTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        capacity: vehicle?.capacity || 6,
        bookedSeats: 0,
        passengers: [],
        status: 'active',
        fare: 25,
      })

      const normRide = normalizeRide(newRide)
      set((state) => ({
        rides: [normRide, ...state.rides.filter((r) => r.id !== normRide.id)],
      }))

      return normRide
    } catch (err: any) {
      console.error('[Store] createAndActivateRide error:', err.message)
      throw err
    }
  },

  completeRide: async (rideId: string) => {
    try {
      const updated = await api.completeRide(rideId)
      set((state) => ({
        rides: state.rides.map((r) =>
          r.id === rideId
            ? {
                ...r,
                ...updated,
                status: 'completed',
                passengers: (updated.passengers && updated.passengers.length > 0
                  ? updated.passengers
                  : r.passengers || []
                ).map((p: any) => ({ ...p, status: 'dropped' })),
              }
            : r
        ),
        bookings: state.bookings.map((b) =>
          b.rideId === rideId ? { ...b, status: 'completed' as const } : b
        ),
      }))
    } catch (err: any) {
      console.error('[Store] completeRide error:', err.message)
      throw err
    }
  },

  refreshRides: async () => {
    try {
      const freshRides = await api.getRides()
      if (Array.isArray(freshRides)) {
        set({ rides: freshRides.map(normalizeRide) })
      }
    } catch (err: any) {
      console.warn('[Store] refreshRides warning:', err.message)
    }
  },

  updatePassengerStatus: async (rideId: string, studentId: string, status: 'boarded' | 'dropped') => {
    try {
      const updated = await api.updatePassengerStatus(rideId, studentId, status)
      const newBookingStatus = status === 'boarded' ? 'boarded' : 'completed'
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? updated : r)),
        bookings: state.bookings.map((b) =>
          b.rideId === rideId && b.studentId === studentId ? { ...b, status: newBookingStatus as any } : b
        ),
      }))
    } catch (err: any) {
      console.error('[Store] updatePassengerStatus error:', err.message)
      throw err
    }
  },

  // Actions — Dispatcher
  loadDispatcherData: async () => {
    try {
      const data = await api.getDispatcherDashboard()

      // Normalize drivers returned by dispatcher dashboard (same shape as UserModel DRIVER docs)
      const normalizedDrivers = (data.drivers || []).map((u: any) => ({
        id: u.id || u._id,
        name: u.name,
        phone: u.phone || '',
        avatar: u.avatar || (u.name ? u.name.slice(0, 2).toUpperCase() : 'D'),
        rating: u.rating || 4.8,
        totalTrips: u.totalTrips || u.totalRides || 0,
        verified: u.isVerified !== false,
        licenseNo: u.licenseNumber || u.licenseNo || '',
        role: 'driver' as const,
        vehicleId: u.vehicleId || '',
        email: u.email,
        driverType: (u.driverType === 'student' ? 'student' : 'regular') as 'regular' | 'student',
        studentId: u.studentId || u.rollNumber || '',
        rollNumber: u.rollNumber || '',
      }))

      // Normalize vehicles returned by dispatcher dashboard
      const normalizedVehicles = (data.vehicles || []).map((v: any) => ({
        id: v.id || v._id,
        name: v.name,
        type: v.vehicleType || v.type || 'Mini Van',
        registration: v.registrationNumber || v.registration || '',
        capacity: v.capacity,
        driverId: v.driverId || '',
        color: v.color || '#0891B2',
        verified: v.isVerified !== false,
        rating: v.rating || 4.8,
        totalTrips: v.totalTrips || 0,
        status: v.status || 'AVAILABLE',
        heading: v.heading,
        speed: v.speed,
        currentLat: v.currentLat,
        currentLng: v.currentLng,
      }))

      set((state) => ({
        rides: data.activeRides?.length ? data.activeRides : state.rides,
        vehicles: normalizedVehicles.length ? normalizedVehicles : state.vehicles,
        drivers: normalizedDrivers.length ? normalizedDrivers : state.drivers,
        safetyEvents: (data.alerts || []).map(normalizeSafetyEvent),
        auditLogs: data.auditLogs || state.auditLogs,
      }))
      return data
    } catch (err: any) {
      console.error('[Store] loadDispatcherData error:', err.message)
      throw err
    }
  },

  reassignDriver: async (rideId: string, driverId: string) => {
    try {
      const res = await api.reassignDriver(rideId, driverId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? res.ride : r)),
        auditLogs: res.auditLog ? [res.auditLog, ...state.auditLogs] : state.auditLogs,
      }))
    } catch (err: any) {
      console.error('[Store] reassignDriver error:', err.message)
      throw err
    }
  },

  reassignVehicle: async (rideId: string, vehicleId: string) => {
    try {
      const res = await api.reassignVehicle(rideId, vehicleId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? res.ride : r)),
        auditLogs: res.auditLog ? [res.auditLog, ...state.auditLogs] : state.auditLogs,
      }))
    } catch (err: any) {
      console.error('[Store] reassignVehicle error:', err.message)
      throw err
    }
  },

  cancelRideByDispatcher: async (rideId: string, reason?: string) => {
    try {
      const res = await api.cancelRideByDispatcher(rideId, reason)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? res.ride : r)),
        auditLogs: res.auditLog ? [res.auditLog, ...state.auditLogs] : state.auditLogs,
      }))
    } catch (err: any) {
      console.error('[Store] cancelRideByDispatcher error:', err.message)
      throw err
    }
  },

  recalculateRideRoute: async (rideId: string) => {
    try {
      const res = await api.recalculateRideRoute(rideId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? res.ride : r)),
        auditLogs: res.auditLog ? [res.auditLog, ...state.auditLogs] : state.auditLogs,
      }))
    } catch (err: any) {
      console.error('[Store] recalculateRideRoute error:', err.message)
      throw err
    }
  },

  resolveSafetyEvent: async (eventId: string) => {
    try {
      sosAlarmPlayer.stop()
      const res = await api.resolveSafetyEvent(eventId)
      const resolvedEvent: SafetyEvent = normalizeSafetyEvent((res as any)?.data || (res as any)?.event || res)
      set((state) => ({
        rides: state.rides.map((r) =>
          resolvedEvent.rideId && r.id === resolvedEvent.rideId ? { ...r, hasDeviation: false, hasSosAlert: false } : r
        ),
        safetyEvents: state.safetyEvents.map((e) => (e.id === eventId ? { ...e, ...resolvedEvent, resolved: true, status: 'RESOLVED' } : e)),
        auditLogs: (res as any)?.auditLog ? [(res as any).auditLog, ...state.auditLogs] : state.auditLogs,
      }))
      sosAlarmPlayer.stop()
    } catch (err: any) {
      sosAlarmPlayer.stop()
      console.error('[Store] resolveSafetyEvent error:', err.message)
      throw err
    }
  },

  resetScheduledFleet: async () => {
    try {
      const res = await api.resetScheduledFleet()
      if (res.rides) {
        set((state) => ({
          rides: state.rides.map((r) => {
            const found = res.rides.find((u: any) => u.id === r.id)
            return found ? { ...r, ...found } : r
          }),
        }))
      }
      await get().loadDispatcherData()
      return res
    } catch (err: any) {
      console.error('[Store] resetScheduledFleet error:', err.message)
      throw err
    }
  },

  loadAuditLog: async () => {
    try {
      const logs = await api.getDispatcherAuditLog()
      set({ auditLogs: logs })
    } catch (err: any) {
      console.error('[Store] loadAuditLog error:', err.message)
    }
  },

  // Safety Actions
  triggerSOS: async (params?: { rideId?: string; userId?: string; lat?: number; lng?: number; emergencyPhone?: string; emergencyName?: string; emergencyEmail?: string } | string, studentId?: string) => {
    try {
      // NOTE: Siren audio is strictly sounded at Dispatcher Command Center, NOT on user/driver device
      sosAlarmPlayer.stop()
      let payload: {
        rideId?: string
        userId?: string
        lat?: number
        lng?: number
        emergencyPhone?: string
        emergencyName?: string
        emergencyEmail?: string
      } = {}

      if (typeof params === 'string') {
        payload = { rideId: params, userId: studentId || get().currentStudentId || get().currentUser?.id }
      } else if (params && typeof params === 'object') {
        payload = { ...params }
        if (!payload.userId) {
          payload.userId = get().role === 'driver' ? (get().currentDriverId || get().currentUser?.id) : (get().currentStudentId || get().currentUser?.id)
        }
      } else {
        payload = {
          userId: get().role === 'driver' ? (get().currentDriverId || get().currentUser?.id) : (get().currentStudentId || get().currentUser?.id)
        }
      }

      const isDummy = (p?: string) =>
        !p ||
        p.replace(/\D/g, '').includes('9876543210') ||
        p.replace(/\D/g, '').includes('9876543219') ||
        p.replace(/\D/g, '').length < 10

      // Auto-attach stored emergency contact if not explicitly provided or if payload has dummy fallback
      const storeContact = get().emergencyContact
      if ((!payload.emergencyPhone || isDummy(payload.emergencyPhone)) && storeContact?.phone) {
        payload.emergencyPhone = storeContact.phone
        payload.emergencyName = storeContact.name
      }

      const res = await api.triggerSOS(payload)
      const eventData = res?.data || res
      const normalized = normalizeSafetyEvent(eventData)

      set((state) => ({
        rides: state.rides.map((r) => (payload.rideId && r.id === payload.rideId ? { ...r, hasSosAlert: true } : r)),
        safetyEvents: [normalized, ...state.safetyEvents.filter((e) => e.id !== normalized.id)],
      }))

      return eventData
    } catch (err: any) {
      console.error('[Store] triggerSOS error:', err.message)
      throw err
    }
  },

  setEmergencyContact: (contact: EmergencyContact | null) => {
    set({ emergencyContact: contact })
  },

  loadEmergencyContact: async () => {
    const userId = get().currentUser?.id || get().currentStudentId || get().currentDriverId
    if (!userId) return null
    try {
      const contact = await api.getEmergencyContact(userId)
      set({ emergencyContact: contact || null })
      return contact
    } catch {
      return null
    }
  },

  acknowledgeSafetyEvent: async (eventId: string) => {
    try {
      sosAlarmPlayer.stop()
      // Optimistically mark as ACKNOWLEDGED immediately so all listeners and UI instantly silence
      set((state) => ({
        safetyEvents: state.safetyEvents.map((e) => (e.id === eventId ? { ...e, status: 'ACKNOWLEDGED' } : e)),
      }))
      const res = await api.acknowledgeSafetyEvent(eventId)
      const acknowledged: SafetyEvent = normalizeSafetyEvent((res as any)?.data || (res as any)?.event || res)
      set((state) => ({
        safetyEvents: state.safetyEvents.map((e) => (e.id === eventId ? { ...e, ...acknowledged, status: 'ACKNOWLEDGED' } : e)),
      }))
      sosAlarmPlayer.stop()
    } catch (err: any) {
      sosAlarmPlayer.stop()
      console.error('[Store] acknowledgeSafetyEvent error:', err.message)
      throw err
    }
  },

  triggerDeviation: async (rideId: string) => {
    try {
      await api.triggerDeviation(rideId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? { ...r, hasDeviation: true } : r)),
      }))
    } catch (err: any) {
      console.error('[Store] triggerDeviation error:', err.message)
    }
  },

  resolveDeviation: async (rideId: string, eventId: string) => {
    try {
      const res = await api.resolveSafetyEvent(eventId)
      const resolvedEvent: SafetyEvent = normalizeSafetyEvent((res as any)?.data || (res as any)?.event || res)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? { ...r, hasDeviation: false, hasSosAlert: false } : r)),
        safetyEvents: state.safetyEvents.map((e) => (e.id === eventId ? resolvedEvent : e)),
      }))
    } catch (err: any) {
      console.error('[Store] resolveDeviation error:', err.message)
    }
  },

  // Messaging — persisted via backend Notification model
  sendMessage: async (rideId, text, driverId, bookingId) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const { currentUser, currentStudentId, students, rides, bookings } = get()
    const sender = currentUser || students.find((s) => s.id === currentStudentId)
    const senderId = sender?.id || currentStudentId || 's1'
    const senderName = sender?.name || (senderId !== 's1' ? `Student (${senderId})` : 'Student')
    const ride = rides.find((r) => r.id === rideId)
    const targetDriverId = driverId || ride?.driverId || (ride as any)?.driver?.id || ''
    const booking = bookings.find(
      (b) => b.rideId === rideId && (b.studentId === senderId || b.studentId === currentStudentId)
    )
    const activeBookingId = bookingId || booking?.id

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const optimisticMsg: RideMessage = {
      id: tempId,
      rideId,
      fromId: senderId,
      fromName: senderName,
      fromRole: 'student',
      text: trimmed,
      sentAt: new Date().toISOString(),
      read: false,
    }
    // Optimistically add to local messages immediately so UI updates with zero delay
    set((state) => ({ messages: [...state.messages, optimisticMsg] }))

    try {
      const doc = await api.sendRideMessage({
        rideId,
        bookingId: activeBookingId,
        senderId,
        senderName,
        senderRole: 'student',
        driverId: targetDriverId,
        receiverId: targetDriverId,
        text: trimmed,
      })
      const finalId = doc?.id || doc?._id || tempId
      const finalCreatedAt = doc?.createdAt || optimisticMsg.sentAt
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, id: finalId, sentAt: finalCreatedAt } : m
        ),
      }))
      get().fetchNotifications()
    } catch (err: any) {
      console.error('[Store] sendMessage error:', err.message)
    }
  },

  replyToMessage: async (rideId, text, studentId, bookingId) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const { currentUser, currentDriverId, drivers, rides } = get()
    const driver = currentUser || drivers.find((d) => d.id === currentDriverId)
    const senderId = driver?.id || currentDriverId || 'd1'
    const senderName = driver?.name || 'Driver'
    const ride = rides.find((r) => r.id === rideId)
    const targetDriverId = senderId || ride?.driverId || ''
    const targetStudentId = studentId || ''

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const optimisticMsg: RideMessage = {
      id: tempId,
      rideId,
      fromId: senderId,
      fromName: senderName,
      fromRole: 'driver',
      text: trimmed,
      sentAt: new Date().toISOString(),
      read: false,
    }
    // Optimistically add to local messages immediately
    set((state) => ({ messages: [...state.messages, optimisticMsg] }))

    try {
      const doc = await api.sendRideMessage({
        rideId,
        bookingId,
        senderId,
        senderName,
        senderRole: 'driver',
        driverId: targetDriverId,
        studentId: targetStudentId,
        receiverId: targetStudentId,
        text: trimmed,
      })
      const finalId = doc?.id || doc?._id || tempId
      const finalCreatedAt = doc?.createdAt || optimisticMsg.sentAt
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, id: finalId, sentAt: finalCreatedAt } : m
        ),
      }))
      get().fetchNotifications()
    } catch (err: any) {
      console.error('[Store] replyToMessage error:', err.message)
    }
  },

  fetchRideMessages: async (rideId) => {
    try {
      const docs = await api.getRideMessages(rideId)
      const msgs: RideMessage[] = (docs || []).map((doc: any) => {
        const role = (doc.metadata?.senderRole || (doc.role === 'student' ? 'driver' : 'student')) as 'student' | 'driver'
        const name = doc.metadata?.senderName || (role === 'driver' ? 'Driver' : 'Student')
        return {
          id: doc.id || doc._id,
          rideId: doc.rideId,
          fromId: doc.metadata?.senderId || (role === 'driver' ? doc.driverId : doc.studentId) || '',
          fromName: name,
          fromRole: role,
          text: doc.message,
          sentAt: doc.createdAt,
          read: Boolean(doc.read),
        }
      })
      set((state) => {
        const backendIds = new Set(msgs.map((m) => m.id))
        const optimistic = state.messages.filter(
          (m) =>
            m.rideId === rideId &&
            !backendIds.has(m.id) &&
            !msgs.some((bm) => bm.text === m.text && bm.fromRole === m.fromRole)
        )
        const otherRides = state.messages.filter((m) => m.rideId !== rideId)
        return { messages: [...otherRides, ...msgs, ...optimistic] }
      })
    } catch (err: any) {
      console.error('[Store] fetchRideMessages error:', err.message)
    }
  },

  markMessagesRead: async (rideId, role) => {
    try {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.rideId === rideId && m.fromRole !== role ? { ...m, read: true } : m
        ),
        notifications: state.notifications.map((n) =>
          n.rideId === rideId && n.type === 'message' ? { ...n, read: true } : n
        ),
      }))
      await api.markRideMessagesRead(rideId)
    } catch (err: any) {
      console.error('[Store] markMessagesRead error:', err.message)
    }
  },

  fetchNotifications: async () => {
    try {
      const notifs = await api.getNotifications()
      if (Array.isArray(notifs)) {
        set({ notifications: notifs })
      }
    } catch (err: any) {
      console.error('[Store] fetchNotifications error:', err.message)
    }
  },

  // Notifications
  markNotificationRead: async (notifId: string) => {
    try {
      await api.markNotificationRead(notifId)
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === notifId ? { ...n, read: true } : n)),
      }))
    } catch (err: any) {
      console.error('[Store] markNotificationRead error:', err.message)
    }
  },

  markAllRead: async () => {
    try {
      await api.markAllNotificationsRead()
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      }))
    } catch (err: any) {
      console.error('[Store] markAllRead error:', err.message)
    }
  },

  addNotification: (n: Omit<Notification, 'id' | 'createdAt'>) => {
    const newN: Notification = {
      ...n,
      id: `n-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({ notifications: [newN, ...state.notifications] }))
  },

  // Demo Controls
  fillNextSeat: async (rideId = 'ride-102') => {
    try {
      const updated = await api.demoFillSeat(rideId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? updated : r)),
      }))
    } catch (err: any) {
      console.error('[Store] demo fillNextSeat error:', err.message)
    }
  },

  cancelPassenger: async (rideId = 'ride-102') => {
    try {
      const updated = await api.demoCancelPassenger(rideId)
      set((state) => ({
        rides: state.rides.map((r) => (r.id === rideId ? updated : r)),
      }))
    } catch (err: any) {
      console.error('[Store] demo cancelPassenger error:', err.message)
    }
  },

  addStudentRequest: async () => {
    try {
      const notif = await api.demoAddStudent()
      set((state) => ({
        notifications: [notif, ...state.notifications],
      }))
    } catch (err: any) {
      console.error('[Store] demo addStudentRequest error:', err.message)
    }
  },

  simulateTraffic: async () => {
    try {
      const res = await api.demoTraffic()
      set((state) => ({
        sim: {
          trafficActive: res.trafficActive,
          demoMessage: res.trafficActive
            ? 'Traffic simulation active. Autonomous dynamic rerouting engaged.'
            : null,
        },
      }))
    } catch (err: any) {
      console.error('[Store] demo simulateTraffic error:', err.message)
    }
  },

  resetDemo: async () => {
    try {
      await api.demoReset()
      await get().initBackend()
    } catch (err: any) {
      console.error('[Store] demo resetDemo error:', err.message)
    }
  },
}))
