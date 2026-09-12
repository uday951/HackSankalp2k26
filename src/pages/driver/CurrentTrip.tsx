import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  MapPin,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Navigation,
  Play,
  Crosshair,
  Compass,
  AlertTriangle,
  RotateCcw,
  Radio,
  Sparkles,
  ArrowUp,
  CornerUpRight,
  CornerUpLeft,
  MessageCircle,
  Wrench,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useLiveTrip } from '../../hooks/useLiveTrip'
import { api } from '../../services/api'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import CampusMap from '../../components/map/CampusMap'
import Avatar from '../../components/ui/Avatar'
import toast from 'react-hot-toast'
import { StartPointSelectorModal } from '../../components/driver/StartPointSelectorModal'
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon)
  let brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

export default function CurrentTrip() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetRideId = searchParams.get('rideId')

  const rides = useAppStore((s) => s.rides)
  const bookings = useAppStore((s) => s.bookings)
  const students = useAppStore((s) => s.students)
  const currentUser = useAppStore((s) => s.currentUser)
  const currentDriverId = useAppStore((s) => s.currentDriverId)
  const currentDriver = useAppStore((s) => s.currentDriver())
  const completeRideInStore = useAppStore((s) => s.completeRide)
  const refreshRides = useAppStore((s) => s.refreshRides)

  // Driver-specific rides fetched directly from the authenticated driver endpoint
  const [driverRides, setDriverRides] = useState<any[]>([])

  const loadDriverRides = useCallback(async () => {
    try {
      const [fresh, currentTrip] = await Promise.all([
        api.getDriverRides().catch(() => null),
        api.getCurrentTripForDriver(currentDriverId || undefined).catch(() => null),
      ])
      const combined: any[] = []
      if (currentTrip) {
        combined.push(currentTrip)
      }
      if (Array.isArray(fresh)) {
        for (const r of fresh) {
          if (!combined.some((c) => c.id === r.id)) {
            combined.push(r)
          }
        }
      }
      if (combined.length > 0) {
        setDriverRides(combined)
      }
    } catch {
      // fallback — use global rides store
    }
  }, [currentDriverId])

  // Fetch freshest rides from server on mount
  useEffect(() => {
    refreshRides()
    loadDriverRides()
  }, [refreshRides, loadDriverRides])

  // Real-time synchronization for passenger bookings & ride status updates
  useEffect(() => {
    const unsub = api.onRealtimeEvent((event) => {
      if (
        event === 'BOOKING_CREATED' ||
        event === 'BOOKING_UPDATED' ||
        event === 'BOOKING_CANCELLED' ||
        event === 'PASSENGER_ADDED' ||
        event === 'PASSENGER_BOARDED' ||
        event === 'PASSENGER_DROPPED' ||
        event === 'RIDE_UPDATED' ||
        event === 'RIDE_STARTED' ||
        event === 'ROUTE_UPDATED' ||
        event === 'TRIP_CREATED' ||
        event === 'TRIP_ROUTE_UPDATED' ||
        event === 'PASSENGER_JOINED_TRIP' ||
        event === 'PASSENGER_REMOVED_FROM_TRIP'
      ) {
        refreshRides()
        loadDriverRides()
      }
    })
    return unsub
  }, [refreshRides, loadDriverRides])

  // Merge driverRides (authoritative) with global rides store for ride selection
  // driverRides takes priority — these are the rides actually assigned to this driver
  const allDriverRides = useMemo(() => {
    const driverIds = new Set([
      currentDriverId,
      currentDriver?.id,
      currentUser?.id,
    ].filter(Boolean))

    // Start with driver-specific rides from the driver endpoint
    const merged = new Map<string, any>()
    for (const r of driverRides) {
      merged.set(r.id, r)
    }

    // Also include rides from the global store that match this driver
    for (const r of rides) {
      if (!merged.has(r.id)) {
        const isMyRide =
          (r.driverId && driverIds.has(r.driverId)) ||
          // fallback for demo rides when no real auth
          ((!currentDriverId || currentDriverId === 'd1') && (r.driverId === 'd1' || r.driverId === 'driver-1')) ||
          (currentDriver?.name && (r as any).driverName === currentDriver.name)
        if (isMyRide) {
          merged.set(r.id, r)
        }
      }
    }

    return Array.from(merged.values())
  }, [driverRides, rides, currentDriverId, currentDriver, currentUser])

  const sortedRides = [...allDriverRides].sort((a, b) => {
    const timeA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0
    const timeB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0
    if (timeA !== timeB) return timeB - timeA
    return b.id.localeCompare(a.id)
  })

  // Prioritize rides that actually have booked passengers or active status
  const activeRide = (targetRideId ? (allDriverRides.find((r) => r.id === targetRideId) || sortedRides.find((r) => r.id === targetRideId)) : null) ||
    // Priority 1: In-progress ride that has passengers
    sortedRides.find((r) => (r.status === 'active' || r.status === 'boarding') && ((r.bookedSeats && r.bookedSeats > 0) || (r.passengers && r.passengers.length > 0))) ||
    // Priority 2: Waiting/full ride that has passengers
    sortedRides.find((r) => (r.status === 'waiting' || r.status === 'full') && ((r.bookedSeats && r.bookedSeats > 0) || (r.passengers && r.passengers.length > 0))) ||
    // Priority 3: Any ride with passengers regardless of status
    sortedRides.find((r) => ((r.bookedSeats && r.bookedSeats > 0) || (r.passengers && r.passengers.length > 0)) && r.status !== 'completed' && r.status !== 'cancelled') ||
    // Priority 4: Active or boarding ride even if empty
    sortedRides.find((r) => r.status === 'active' || r.status === 'boarding') ||
    // Priority 5: Waiting ride
    sortedRides.find((r) => r.status === 'waiting') ||
    sortedRides[0]

  // Fetch enriched passenger manifest from the new /rides/:id/passengers endpoint
  // This merges ride.passengers + BookingModel for complete, authoritative data
  const [ridePassengers, setRidePassengers] = useState<any[]>([])

  const loadRidePassengers = useCallback(async (rideId?: string) => {
    const id = rideId || activeRide?.id
    if (!id) return
    try {
      const data = await api.getRidePassengers(id)
      if (Array.isArray(data)) {
        setRidePassengers(data)
      }
    } catch {
      // fallback: try the bookings endpoint
      try {
        const data = await api.getRideBookings(id)
        if (Array.isArray(data)) {
          setRidePassengers(data.filter((b: any) => b.status !== 'cancelled'))
        }
      } catch {
        // ignore
      }
    }
  }, [activeRide?.id])

  // Load passengers immediately when activeRide changes
  useEffect(() => {
    loadRidePassengers()
  }, [loadRidePassengers])

  // Keep passengers in sync on all relevant realtime events
  useEffect(() => {
    const unsub = api.onRealtimeEvent((event, payload) => {
      if (
        event === 'BOOKING_CREATED' ||
        event === 'BOOKING_UPDATED' ||
        event === 'BOOKING_CANCELLED' ||
        event === 'PASSENGER_ADDED' ||
        event === 'PASSENGER_BOARDED' ||
        event === 'PASSENGER_DROPPED' ||
        event === 'RIDE_UPDATED'
      ) {
        // Reload passengers for the affected ride or current active ride
        const affectedRideId = payload?.rideId || payload?.ride?.id || activeRide?.id
        if (affectedRideId) {
          loadRidePassengers(affectedRideId)
        }
      }
    })
    return unsub
  }, [activeRide?.id, loadRidePassengers])

  // Live Trip Hook
  const {
    tripState,
    loading: tripLoading,
    cameraMode,
    setCameraMode,
    isRecenterNeeded,
    recenter,
    handleUserPan,
    vehiclePosition,
    vehicleHeading,
    sendDriverLocation,
    markStopArrived,
    markStopBoarded,
    updatePassengerStatus,
    startTrip,
    completeTrip,
    recalculateRoute,
  } = useLiveTrip({
    rideId: activeRide?.id,
    defaultCameraMode: 'FOLLOW',
  })

  // Authoritative synced ride state
  const effectiveRide = tripState?.ride ? { ...activeRide, ...tripState.ride } : activeRide

  // Complete passenger manifest: use the enriched ridePassengers from /rides/:id/passengers as primary source
  // Falls back to effectiveRide.passengers if ridePassengers is not yet loaded
  const manifestPassengers = useMemo(() => {
    // If we have authoritative data from the new endpoint, use it
    if (ridePassengers.length > 0) {
      return ridePassengers
    }
    // Fallback: use passengers embedded in the ride document
    return effectiveRide?.passengers || []
  }, [ridePassengers, effectiveRide?.passengers])

  // Computed route stops ensuring driver origin is stop 1 and omitting unbooked placeholder stops
  const routeStops = useMemo(() => {
    const baseStops = (tripState?.stops && tripState.stops.length > 0)
      ? tripState.stops
      : (effectiveRide?.stops || [])

    const originName = effectiveRide?.startLocation || effectiveRide?.pickupPoints?.[0]?.name || 'Driver Start Location'
    const originLat = effectiveRide?.startLocationLat || effectiveRide?.currentLat || 17.4934
    const originLng = effectiveRide?.startLocationLng || effectiveRide?.currentLng || 78.3995

    let result = [...baseStops]

    // If driver started at a custom location, filter out any unbooked template "Railway Station" stops
    if (originName.toLowerCase() !== 'railway station') {
      result = result.filter((s) => {
        if (s.name.toLowerCase() === 'railway station' && !s.studentId && !s.bookingId) {
          return false
        }
        return true
      })
    }

    const hasOrigin = result.some((s) => s.name.toLowerCase() === originName.toLowerCase() || s.id?.includes('origin'))
    if (!hasOrigin && originName) {
      result.unshift({
        id: `stop-${effectiveRide?.id || 'curr'}-origin`,
        type: 'PICKUP',
        name: originName,
        latitude: originLat,
        longitude: originLng,
        sequence: 1,
        status: effectiveRide?.status === 'active' ? 'COMPLETED' : 'UPCOMING',
        estimatedArrival: 'Departed',
      })
    }

    return result.map((s, i) => ({
      ...s,
      sequence: i + 1,
    }))
  }, [
    tripState?.stops,
    effectiveRide?.stops,
    effectiveRide?.startLocation,
    effectiveRide?.startLocationLat,
    effectiveRide?.startLocationLng,
    effectiveRide?.currentLat,
    effectiveRide?.currentLng,
    effectiveRide?.pickupPoints,
    effectiveRide?.status,
    effectiveRide?.id,
  ])

  // Real Browser GPS Tracking state
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false)
  const watchIdRef = useRef<number | null>(null)

  // Demo Route Simulation state
  const [isSimulating, setIsSimulating] = useState<boolean>(false)
  const simIndexRef = useRef<number>(0)
  const simIntervalRef = useRef<any>(null)

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [showStartPointModal, setShowStartPointModal] = useState<boolean>(false)

  // Stop simulation on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  // Vehicle Breakdown & Automated Recovery State
  const [showBreakdownModal, setShowBreakdownModal] = useState<boolean>(false)
  const [isReportingBreakdown, setIsReportingBreakdown] = useState<boolean>(false)
  const [breakdownReported, setBreakdownReported] = useState<boolean>(false)
  const [recoveryInfo, setRecoveryInfo] = useState<any>(null)

  // Realtime listeners for breakdown and recovery
  useEffect(() => {
    const unsub = api.onRealtimeEvent((event, payload) => {
      if (
        event === 'RECOVERY_COMPLETED' &&
        (payload?.rideId === effectiveRide?.id || payload?.oldVehicleId === effectiveRide?.vehicleId)
      ) {
        setRecoveryInfo(payload)
        setBreakdownReported(true)
      } else if (
        event === 'VEHICLE_BREAKDOWN' &&
        (payload?.rideId === effectiveRide?.id || payload?.vehicleId === effectiveRide?.vehicleId)
      ) {
        setBreakdownReported(true)
      }
    })
    return unsub
  }, [effectiveRide?.id, effectiveRide?.vehicleId])

  const handleReportBreakdownConfirm = async () => {
    setIsReportingBreakdown(true)
    try {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      setIsGpsActive(false)
      setIsSimulating(false)

      let lat = vehiclePosition ? vehiclePosition[0] : effectiveRide?.currentLat || 17.385
      let lng = vehiclePosition ? vehiclePosition[1] : effectiveRide?.currentLng || 78.486

      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000, enableHighAccuracy: true })
          )
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          // fallback to last known
        }
      }

      const res = await api.reportDriverBreakdown({
        vehicleId: effectiveRide?.vehicleId,
        location: { lat, lng },
        reason: 'Driver reported vehicle breakdown / malfunction',
      })

      setShowBreakdownModal(false)
      setBreakdownReported(true)
      if (res?.data?.recoveryEvent) {
        setRecoveryInfo(res.data.recoveryEvent)
      }
      toast.success('Vehicle breakdown reported! Automated recovery started.', { icon: '🚨' })
      await refreshRides()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to report breakdown')
    } finally {
      setIsReportingBreakdown(false)
    }
  }

  // Handle Real Device GPS Watch
  const toggleGpsTracking = () => {
    if (isGpsActive) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setIsGpsActive(false)
      toast('Device GPS tracking paused', { icon: '⏸️' })
    } else {
      if (!navigator.geolocation) {
        toast.error('Geolocation is not supported by your browser')
        return
      }

      // Stop simulator if active
      if (isSimulating) {
        setIsSimulating(false)
        if (simIntervalRef.current) clearInterval(simIntervalRef.current)
      }

      setIsGpsActive(true)
      toast.success('Live GPS telematics active! Broadcasting coordinates...')

      let prevCoords: { lat: number; lng: number } | null = null

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 25
          let heading = pos.coords.heading ?? 0

          if (!heading && prevCoords) {
            heading = calculateHeading(prevCoords.lat, prevCoords.lng, lat, lng)
          }
          prevCoords = { lat, lng }

          sendDriverLocation({ lat, lng, heading, speed })
        },
        (err) => {
          console.warn('[GPS] Error:', err)
          toast.error(`GPS Error: ${err.message}`)
          setIsGpsActive(false)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      )
    }
  }

  // Handle Demo Route Simulation
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
      setIsSimulating(false)
      toast('Route simulation paused', { icon: '⏸️' })
    } else {
      const geometry = tripState?.route?.geometry || activeRide?.routeCoordinates || []
      if (!geometry || geometry.length < 2) {
        toast.error('No road route coordinates available to simulate')
        return
      }

      // Stop real GPS if active
      if (isGpsActive && watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        setIsGpsActive(false)
      }

      setIsSimulating(true)
      toast.success('Starting realistic OSRM route simulation! 🚀')

      // Find closest index to start or continue
      if (vehiclePosition) {
        let minD = Infinity
        let bestIdx = 0
        for (let i = 0; i < geometry.length; i++) {
          const d = distanceMeters(vehiclePosition[0], vehiclePosition[1], geometry[i][0], geometry[i][1])
          if (d < minD) {
            minD = d
            bestIdx = i
          }
        }
        simIndexRef.current = bestIdx >= geometry.length - 1 ? 0 : bestIdx
      } else {
        simIndexRef.current = 0
      }

      simIntervalRef.current = setInterval(() => {
        const geom = tripState?.route?.geometry || activeRide?.routeCoordinates || []
        if (simIndexRef.current >= geom.length - 1) {
          clearInterval(simIntervalRef.current)
          setIsSimulating(false)
          toast.success('Destination reached! You can now complete the trip.')
          return
        }

        const curr = geom[simIndexRef.current]
        const next = geom[simIndexRef.current + 1]
        const heading = calculateHeading(curr[0], curr[1], next[0], next[1])
        const speed = 35 // km/h

        sendDriverLocation({
          lat: next[0],
          lng: next[1],
          heading,
          speed,
        })

        simIndexRef.current += 1
      }, 1500)
    }
  }

  if (!effectiveRide || (!targetRideId && (effectiveRide.status === 'completed' || effectiveRide.status === 'cancelled'))) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-20 text-center">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Navigation size={32} />
        </div>
        <h2 className="font-heading font-bold text-xl text-slate-800 mb-2">No Active Trip in Progress</h2>
        <p className="text-slate-500 text-sm mb-6">
          All your trips are completed. Start or accept a new ride from your driver dashboard.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={() => navigate('/driver/dashboard')}>Driver Dashboard</Button>
          <Button variant="secondary" onClick={() => navigate('/driver/profile?tab=history')}>
            View Trip History
          </Button>
        </div>
      </div>
    )
  }

  const handleStartTripAction = async (startPoint?: { name: string; lat: number; lng: number; address?: string }) => {
    if (!startPoint) {
      setShowStartPointModal(true)
      return
    }
    setIsSubmitting(true)
    try {
      await startTrip(startPoint)
      toast.success(`Trip started from ${startPoint.name}! Navigation HUD engaged.`, { icon: '🚀' })
      setShowStartPointModal(false)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start trip')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCompleteTripAction = async () => {
    setIsSubmitting(true)
    try {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      await completeTrip()
      if (activeRide?.id) {
        await completeRideInStore(activeRide.id).catch(() => {})
      }
      await refreshRides()
      toast.success('Trip completed successfully! All bookings and passengers updated.')
      navigate('/driver/profile?tab=history')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete trip')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Active Stop and Next Maneuver
  const currentStop = tripState?.currentStop || (tripState?.stops && tripState.stops[0]) || null
  const progress = tripState?.progress
  const nextManeuver = tripState?.nextManeuver

  // Turn-by-Turn icon selector
  const getManeuverIcon = (type?: string) => {
    if (!type) return <ArrowUp className="w-5 h-5 text-white" />
    if (type.includes('right')) return <CornerUpRight className="w-5 h-5 text-white" />
    if (type.includes('left')) return <CornerUpLeft className="w-5 h-5 text-white" />
    return <ArrowUp className="w-5 h-5 text-white" />
  }

  const isBrokenDown =
    breakdownReported ||
    effectiveRide.status === 'recovery_pending' ||
    Boolean(effectiveRide.recoveryId && effectiveRide.status !== 'active')

  if (isBrokenDown) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-10 pb-16 text-center">
        <div className="bg-red-50 border-2 border-red-300 rounded-3xl p-6 sm:p-8 text-center shadow-xl mb-6 animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Wrench size={32} className="animate-bounce" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white font-bold rounded-full text-xs uppercase tracking-wider mb-3">
            Vehicle Breakdown Reported
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-slate-900 mb-2">
            Automated Ride Recovery {recoveryInfo?.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
          </h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed max-w-md mx-auto">
            {recoveryInfo?.status === 'COMPLETED'
              ? `All passengers on ${effectiveRide.routeName} were automatically transferred to replacement vehicle ${recoveryInfo.replacementVehicleName || recoveryInfo.replacementVehicleId}. Your vehicle is marked OUT OF SERVICE.`
              : 'Our automated recovery system is actively finding and reassigning a suitable replacement vehicle. Passenger bookings and locked fares are preserved without rebooking.'}
          </p>

          <div className="grid grid-cols-2 gap-3 text-left mb-6">
            <div className="bg-white p-3.5 rounded-2xl border border-red-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Vehicle Status</span>
              <span className="text-sm font-extrabold text-red-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                OUT OF SERVICE
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-red-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Passengers</span>
              <span className="text-sm font-extrabold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle size={14} className="text-emerald-500" />
                Transferred Automatically
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate('/driver/dashboard')}>
              Return to Driver Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-8 space-y-4">
      {/* Turn-by-Turn Navigation HUD (Rapido/Uber style) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-4 shadow-xl border border-slate-700/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0 shadow-md">
            {getManeuverIcon(nextManeuver?.maneuverType)}
          </div>
          <div>
            <div className="text-xs text-primary-300 font-semibold tracking-wider uppercase">
              {nextManeuver ? `In ${nextManeuver.distanceMeters}m` : 'Navigation Active'}
            </div>
            <div className="font-bold text-base text-white line-clamp-1">
              {nextManeuver?.instruction || `Head towards ${currentStop?.name || effectiveRide.destination}`}
            </div>
          </div>
        </div>

        {/* ETA & Distance Telematics */}
        <div className="text-right flex-shrink-0 border-l border-slate-700/80 pl-4">
          <div className="text-lg font-extrabold text-emerald-400">
            {progress?.etaString || effectiveRide.estimatedArrival || '8:35 AM'}
          </div>
          <div className="text-xs text-slate-300 font-medium">
            {progress?.remainingDistanceMeters
              ? `${(progress.remainingDistanceMeters / 1000).toFixed(1)} km · ${Math.round(progress.remainingDurationSeconds / 60)} min`
              : `${effectiveRide.distanceKm} km`}
          </div>
        </div>
      </div>

      {/* Vehicle Status & Automated Breakdown Recovery Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Vehicle Status</span>
            <span className="text-xs font-extrabold text-slate-800">
              {tripState?.vehicle?.name || 'Assigned Vehicle'} · <span className="text-emerald-600 font-bold">ACTIVE</span>
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant="danger"
          className="text-xs h-8 px-3 font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300"
          onClick={() => setShowBreakdownModal(true)}
        >
          <Wrench size={13} className="mr-1.5" />
          Report Vehicle Breakdown
        </Button>
      </div>

      {/* Starting Location Info Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0">
            📍
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Vehicle Start Point</span>
            <span className="font-bold text-slate-800">
              {effectiveRide.startLocation || tripState?.route?.origin?.name || effectiveRide.pickupPoints?.[0]?.name || 'Origin'}
            </span>
          </div>
        </div>
        {effectiveRide.status !== 'completed' && (
          <Button
            size="sm"
            variant="secondary"
            className="text-xs h-7 px-2.5 border-emerald-300 text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100"
            onClick={() => setShowStartPointModal(true)}
          >
            Change Start Point
          </Button>
        )}
      </div>

      {/* Off-Route Alert Banner */}
      {progress?.isOffRoute && (
        <div className="bg-amber-500/15 border border-amber-500/30 text-amber-900 rounded-xl p-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Off-route deviation detected ({progress.deviationMeters}m). Road rerouting in progress.</span>
          </div>
          <Button size="sm" variant="secondary" className="text-xs h-7 px-2.5" onClick={() => recalculateRoute()}>
            Reroute Now
          </Button>
        </div>
      )}

      {/* Map Card */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-200">
        <CampusMap
          stops={tripState?.stops || effectiveRide.stops || []}
          routeCoordinates={tripState?.route?.geometry || effectiveRide.routeCoordinates || []}
          vehicleLat={vehiclePosition ? vehiclePosition[0] : effectiveRide.currentLat}
          vehicleLng={vehiclePosition ? vehiclePosition[1] : effectiveRide.currentLng}
          vehicleHeading={vehicleHeading}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          onRecenter={recenter}
          height="h-72"
          interactive
          alertMode={progress?.isOffRoute || effectiveRide.hasDeviation}
          showRecenterButton={isRecenterNeeded}
          rideBookedSeats={effectiveRide.bookedSeats ?? manifestPassengers.length}
          rideCapacity={effectiveRide.capacity}
        />

        {/* Floating Telematics Simulation & GPS Controls */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {/* Real Device GPS Toggle */}
          <button
            onClick={toggleGpsTracking}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-md backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer ${
              isGpsActive
                ? 'bg-emerald-600 text-white border border-emerald-400'
                : 'bg-white/95 text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isGpsActive ? 'animate-pulse' : ''}`} />
            <span>{isGpsActive ? 'Phone GPS: ON' : 'Phone GPS'}</span>
          </button>

          {/* OSRM Route Demo Simulator Toggle */}
          <button
            onClick={toggleSimulation}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-md backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer ${
              isSimulating
                ? 'bg-primary-600 text-white border border-primary-400 animate-pulse'
                : 'bg-white/95 text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSimulating ? 'Simulating Drive...' : 'Simulate Drive'}</span>
          </button>
        </div>

        {/* Camera mode selector pill */}
        <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md rounded-xl p-1 shadow border border-slate-200 flex items-center gap-1 text-[11px] font-semibold">
          <button
            onClick={() => setCameraMode('FOLLOW')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              cameraMode === 'FOLLOW' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Follow Car
          </button>
          <button
            onClick={() => setCameraMode('OVERVIEW')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              cameraMode === 'OVERVIEW' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Route Overview
          </button>
          <button
            onClick={() => setCameraMode('FREE_EXPLORE')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              cameraMode === 'FREE_EXPLORE' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Free Explore
          </button>
        </div>
      </div>

      {/* Active Stop Action Card (Uber/Rapido style) */}
      {currentStop && (
        <Card padding="md" className="border-2 border-primary-500/30 bg-primary-50/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary-600 text-white font-bold text-xs flex items-center justify-center">
                {currentStop.type === 'DROPOFF' ? '★' : currentStop.sequence}
              </span>
              <div>
                <span className="text-[11px] font-bold text-primary-700 tracking-wider uppercase">
                  {currentStop.type === 'DROPOFF' ? 'Destination Hub' : 'Current Pickup Stop'}
                </span>
                <h3 className="text-base font-bold text-slate-900">{currentStop.name}</h3>
              </div>
            </div>

            <Badge
              variant={
                currentStop.status === 'ARRIVED'
                  ? 'yellow'
                  : currentStop.status === 'BOARDED' || currentStop.status === 'COMPLETED'
                  ? 'green'
                  : 'blue'
              }
            >
              {currentStop.status}
            </Badge>
          </div>

          {/* Quick Actions for Driver at Current Stop */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
            {currentStop.type !== 'DROPOFF' && currentStop.status !== 'ARRIVED' && currentStop.status !== 'BOARDED' && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => markStopArrived(currentStop.id)}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Mark Arrived at Stop
              </Button>
            )}

            {currentStop.type !== 'DROPOFF' && currentStop.status === 'ARRIVED' && (
              <Button
                variant="green"
                size="sm"
                className="flex-1"
                onClick={() => markStopBoarded(currentStop.id)}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Board Passenger & Advance
              </Button>
            )}

            {currentStop.type === 'DROPOFF' && (tripState?.stops || effectiveRide.stops || []).filter((s: any) => s.type === 'DROPOFF' && s.status !== 'COMPLETED').length > 1 && (
              <Button
                variant="green"
                size="sm"
                className="flex-1"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true)
                  try {
                    if (currentStop.studentId) {
                      await updatePassengerStatus(currentStop.studentId, 'dropped')
                    } else {
                      await markStopBoarded(currentStop.id)
                    }
                    await refreshRides()
                    toast.success(`Dropped off passenger at ${currentStop.name}`)
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to complete dropoff')
                  } finally {
                    setIsSubmitting(false)
                  }
                }}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Drop Off Passenger at {currentStop.name} & Continue
              </Button>
            )}

            {currentStop.type === 'DROPOFF' && (tripState?.stops || effectiveRide.stops || []).filter((s: any) => s.type === 'DROPOFF' && s.status !== 'COMPLETED').length <= 1 && (
              <Button
                variant="green"
                size="sm"
                className="flex-1"
                disabled={isSubmitting}
                onClick={handleCompleteTripAction}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                {isSubmitting ? 'Completing Trip...' : 'Arrived at Final Destination — Complete Trip'}
              </Button>
            )}

            {effectiveRide.status !== 'active' && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                disabled={isSubmitting}
                onClick={() => setShowStartPointModal(true)}
              >
                <Play className="w-4 h-4 mr-1.5 fill-current" />
                {isSubmitting ? 'Starting...' : 'Start Trip'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Stop Sequence Progression Checklist */}
      <Card padding="md">
        <h3 className="font-heading font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
          <span>Route Stops ({routeStops.length})</span>
          <span className="text-xs font-semibold text-primary-600">
            {progress?.percent ? `${progress.percent}% Completed` : '0% Completed'}
          </span>
        </h3>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-primary-600 transition-all duration-500 rounded-full"
            style={{ width: `${progress?.percent || 0}%` }}
          />
        </div>

        <div className="space-y-3">
          {(routeStops || []).map((stop, idx) => {
            const isDone = stop.status === 'BOARDED' || stop.status === 'COMPLETED'
            const isCurrent = currentStop?.id === stop.id

            return (
              <div
                key={stop.id || idx}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                  isCurrent ? 'bg-primary-50/50 border border-primary-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                        ? 'bg-primary-600 text-white ring-2 ring-primary-300 animate-pulse'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isDone ? '✓' : stop.type === 'DROPOFF' ? '★' : stop.sequence || idx + 1}
                  </span>
                  <div>
                    <p className={`text-xs font-bold ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {stop.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {stop.type === 'DROPOFF'
                        ? 'Destination'
                        : (stop.id?.includes('origin') || idx === 0)
                        ? 'Start Location (Origin)'
                        : 'Pickup Bay'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    size="sm"
                    variant={isDone ? 'green' : isCurrent ? 'blue' : 'slate'}
                  >
                    {stop.status}
                  </Badge>

                  {isCurrent && stop.status === 'UPCOMING' && (
                    <button
                      onClick={() => markStopArrived(stop.id)}
                      title="Mark Arrived"
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      Arrive
                    </button>
                  )}
                  {isCurrent && stop.status === 'ARRIVED' && (
                    <button
                      onClick={() => markStopBoarded(stop.id)}
                      title="Board Passenger"
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg cursor-pointer font-semibold"
                    >
                      Board
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Pooled Passengers Manifest with Individual Destinations */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" />
            <h3 className="font-heading font-bold text-slate-900 text-sm">
              Pooled Passengers ({manifestPassengers.length})
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {manifestPassengers.filter((p: any) => p.status === 'boarded').length} on board
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {manifestPassengers.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No passengers booked yet.</p>
          ) : (
            manifestPassengers.map((passenger: any) => (
              <div key={passenger.studentId} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={passenger.name} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">{passenger.name}</p>
                      <span className="text-[10px] text-slate-500 font-mono">Seat #{passenger.seatNo}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      <span>Pickup: <strong>{passenger.pickup}</strong></span> →{' '}
                      <span>Dropoff: <strong className="text-emerald-700">{passenger.destination || effectiveRide.destination}</strong></span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    size="sm"
                    variant={
                      passenger.status === 'boarded'
                        ? 'blue'
                        : passenger.status === 'dropped'
                        ? 'green'
                        : 'yellow'
                    }
                  >
                    {passenger.status === 'boarded' ? 'On Board' : passenger.status === 'dropped' ? 'Dropped Off' : 'Waiting'}
                  </Badge>

                  <button
                    type="button"
                    onClick={() => navigate(`/driver/passengers?rideId=${activeRide.id}&tab=messages`)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                    title={`Message ${passenger.name}`}
                  >
                    <MessageCircle size={14} />
                  </button>

                  {passenger.status === 'waiting' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs h-7 px-2.5"
                      onClick={async () => {
                        await updatePassengerStatus(passenger.studentId, 'boarded')
                        await loadRidePassengers()
                        await refreshRides()
                        toast.success(`${passenger.name} marked as boarded`)
                      }}
                    >
                      Board
                    </Button>
                  )}

                  {passenger.status === 'boarded' && (
                    <Button
                      size="sm"
                      variant="green"
                      className="text-xs h-7 px-2.5"
                      onClick={async () => {
                        await updatePassengerStatus(passenger.studentId, 'dropped')
                        await loadRidePassengers()
                        await refreshRides()
                        toast.success(`${passenger.name} marked as dropped off`)
                      }}
                    >
                      Drop Off
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Driver Start Point Selector Modal */}
      {showStartPointModal && effectiveRide && (
        <StartPointSelectorModal
          isOpen={showStartPointModal}
          ride={effectiveRide}
          isStarting={isSubmitting}
          onClose={() => setShowStartPointModal(false)}
          onConfirm={(startPoint) => handleStartTripAction(startPoint)}
        />
      )}

      {/* Vehicle Breakdown Confirmation Modal */}
      {showBreakdownModal && effectiveRide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4 mx-auto">
              <Wrench size={26} />
            </div>
            <h3 className="text-lg font-heading font-bold text-slate-900 text-center mb-2">
              Report Vehicle Breakdown?
            </h3>
            <p className="text-xs text-slate-600 text-center mb-5 leading-relaxed">
              This will immediately start <strong>automated ride recovery</strong>. Passengers will be transferred to another available vehicle when possible.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 mb-6 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Affected Ride:</span>
                <span className="font-bold text-slate-900">{effectiveRide.routeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Passengers:</span>
                <span className="font-bold text-slate-900">
                  {effectiveRide.passengers?.filter((p: any) => p.status !== 'dropped').length || 0} passengers
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Breakdown Location:</span>
                <span className="font-mono text-[11px] text-slate-800">
                  {vehiclePosition
                    ? `${vehiclePosition[0].toFixed(4)}, ${vehiclePosition[1].toFixed(4)}`
                    : 'Current GPS Telematics'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={isReportingBreakdown}
                onClick={() => setShowBreakdownModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={isReportingBreakdown}
                onClick={handleReportBreakdownConfirm}
              >
                {isReportingBreakdown ? 'Reporting...' : 'Confirm Breakdown'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
