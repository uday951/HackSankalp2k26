import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  Shield,
  AlertTriangle,
  Phone,
  Navigation,
  Clock,
  MapPin,
  Users,
  Crosshair,
  CheckCircle2,
  Calendar,
  MessageCircle,
  Send,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useLiveTrip } from '../../hooks/useLiveTrip'
import { api } from '../../services/api'
import CampusMap from '../../components/map/CampusMap'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import { resolveDriverInfo } from '../../utils/driverDirectory'
import Avatar from '../../components/ui/Avatar'

export default function LiveTracking() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetRideId = searchParams.get('rideId')

  const rides = useAppStore((s) => s.rides)
  const bookings = useAppStore((s) => s.bookings)
  const drivers = useAppStore((s) => s.drivers)
  const vehicles = useAppStore((s) => s.vehicles)
  const currentStudentId = useAppStore((s) => s.currentStudentId)
  const currentUser = useAppStore((s) => s.currentUser)
  const messages = useAppStore((s) => s.messages)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const markMessagesRead = useAppStore((s) => s.markMessagesRead)
  const fetchRideMessages = useAppStore((s) => s.fetchRideMessages)
  const refreshRides = useAppStore((s) => s.refreshRides)

  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const currentUserId = currentUser?.id || currentStudentId

  // Refresh rides on mount
  useEffect(() => {
    refreshRides()
  }, [refreshRides])

  // If URL has targetRideId but ride is not in store yet, load it directly
  useEffect(() => {
    if (targetRideId && (!rides.length || !rides.some((r) => r.id === targetRideId))) {
      api.getRide(targetRideId).then((r) => {
        if (r) {
          useAppStore.setState((s) => ({
            rides: [r, ...s.rides.filter((ex) => ex.id !== r.id)],
          }))
        }
      }).catch(() => {})
    }
  }, [targetRideId, rides.length])

  // Fetch live bookings from server on mount if not yet loaded
  useEffect(() => {
    if (currentUserId && bookings.length === 0) {
      api.getUserBookings(currentUserId).then((freshBookings) => {
        if (freshBookings?.length) {
          useAppStore.setState((s) => ({
            bookings: [...freshBookings, ...s.bookings.filter((b) => !freshBookings.some((fb: any) => fb.id === b.id))],
          }))
        }
      }).catch(() => {})
    }
  }, [currentUserId, bookings.length])

  // Find user's confirmed, boarded, or pending booking if any
  const myBooking = bookings.find(
    (b) =>
      (b.studentId === currentUserId || b.studentId === currentStudentId) &&
      (b.status === 'confirmed' || b.status === 'boarded' || b.status === 'pending' || b.status === 'in_transit')
  )

  // Find authoritative ride:
  // 1. Specified directly in query param (?rideId=...)
  // 2. Associated with student's active booking
  // 3. Any ride where current student is in passengers list (not dropped)
  // 4. Any ride currently active or boarding
  // 5. Any waiting ride with booked seats
  // 6. First available ride fallback
  const activeRide =
    (targetRideId ? rides.find((r) => r.id === targetRideId) : null) ||
    (myBooking ? rides.find((r) => r.id === myBooking.rideId) : null) ||
    rides.find(
      (r) =>
        r.status !== 'completed' &&
        r.status !== 'cancelled' &&
        r.passengers?.some(
          (p) => (p.studentId === currentUserId || p.studentId === currentStudentId) && p.status !== 'dropped'
        )
    ) ||
    rides.find((r) => r.status === 'active') ||
    rides.find((r) => r.status === 'boarding') ||
    rides.find((r) => (r.status === 'waiting' || r.status === 'full') && r.bookedSeats > 0) ||
    rides[0]

  // Use authoritative live trip hook
  const {
    tripState,
    loading,
    cameraMode,
    setCameraMode,
    isRecenterNeeded,
    recenter,
    vehiclePosition,
    vehicleHeading,
  } = useLiveTrip({
    rideId: activeRide?.id,
    defaultCameraMode: 'OVERVIEW',
  })

  const effectiveRide = tripState?.ride ? { ...activeRide, ...tripState.ride } : activeRide

  const driverInfo = resolveDriverInfo(effectiveRide?.driverId, (effectiveRide as any)?.driverName, drivers)
  const matchedDriver = effectiveRide ? drivers.find((d) => d.id === effectiveRide.driverId) : undefined
  const driver =
    tripState?.driver ||
    matchedDriver || {
      id: effectiveRide?.driverId || driverInfo.id,
      name: (effectiveRide as any)?.driverName && !(effectiveRide as any).driverName.toLowerCase().includes('campus driver')
        ? (effectiveRide as any).driverName
        : driverInfo.name,
      phone: (effectiveRide as any)?.driverPhone || driverInfo.phone,
      rating: (effectiveRide as any)?.driverRating || driverInfo.rating,
      totalTrips: driverInfo.totalTrips,
      avatar: (effectiveRide as any)?.driverAvatar || driverInfo.avatar,
    }

  const matchedVehicle = effectiveRide ? vehicles.find((v) => v.id === effectiveRide.vehicleId) : undefined
  const vehicle =
    tripState?.vehicle ||
    matchedVehicle || {
      id: effectiveRide?.vehicleId || driverInfo.vehicleId,
      name: (effectiveRide as any)?.vehicleName || driverInfo.vehicleName,
      registration: (effectiveRide as any)?.vehiclePlate || driverInfo.vehicleRegistration,
      vehicleType: driverInfo.vehicleType,
    }

  const progress = tripState?.progress
  const currentStop = tripState?.currentStop

  const rideMessages = activeRide ? messages.filter((m) => m.rideId === activeRide.id) : []
  const unreadFromDriver = rideMessages.filter((m) => m.fromRole === 'driver' && !m.read).length

  useEffect(() => {
    if (activeRide?.id) fetchRideMessages(activeRide.id)
  }, [activeRide?.id])

  useEffect(() => {
    if (chatOpen && activeRide?.id) {
      markMessagesRead(activeRide.id, 'driver')
      fetchRideMessages(activeRide.id)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [chatOpen, rideMessages.length])

  const handleSendChat = async (customText?: string) => {
    const textToSend = (typeof customText === 'string' ? customText : draft).trim()
    if (!textToSend || !activeRide || isSending) return
    setIsSending(true)
    setDraft('')
    try {
      await sendMessage(activeRide.id, textToSend, activeRide.driverId, myBooking?.id)
    } finally {
      setIsSending(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  // Determine current student's passenger record (from ride passengers array)
  const currentPassenger = effectiveRide?.passengers?.find(
    (p) => p.studentId === currentUserId || p.studentId === currentStudentId
  )
  const isDropped = currentPassenger?.status === 'dropped' || myBooking?.status === 'completed'
  const isBoarded = currentPassenger?.status === 'boarded' || myBooking?.status === 'in_transit'

  // Driver starting location
  const driverStart =
    effectiveRide?.startLocation ||
    tripState?.route?.origin?.name ||
    effectiveRide?.pickupPoints?.[0]?.name ||
    'Driver Start'

  // Personal pickup — prefer booking record, then passenger record, then first stop
  const myPickup =
    myBooking?.pickupName ||
    (myBooking as any)?.pickup ||
    currentPassenger?.pickup ||
    effectiveRide?.pickupPoints?.[0]?.name ||
    'Campus Stop'

  // Personal destination — prefer booking record first (student's actual destination),
  // then passenger record, only fall back to ride-level destination last
  const myDestination =
    myBooking?.destinationName ||
    (myBooking as any)?.destination ||
    currentPassenger?.destination ||
    effectiveRide?.destination ||
    'Campus Hub'

  // Find student's personal pickup and dropoff stop for accurate personal ETA
  const stopsList = tripState?.stops || effectiveRide?.stops || []
  const myPickupStop = stopsList.find(
    (s: any) =>
      s.type === 'PICKUP' &&
      (s.studentId === currentUserId || s.name?.toLowerCase() === myPickup.toLowerCase())
  )
  const myDropoffStop = stopsList.find(
    (s: any) =>
      s.type === 'DROPOFF' &&
      (s.studentId === currentUserId || s.name?.toLowerCase() === myDestination.toLowerCase())
  )

  const personalEta = isBoarded
    ? myDropoffStop?.estimatedArrival || progress?.etaString || effectiveRide?.estimatedArrival
    : myPickupStop?.estimatedArrival || progress?.etaString || effectiveRide?.departureTime

  if (!activeRide) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center mb-4">
          <Navigation size={32} />
        </div>
        <h2 className="text-xl font-heading font-bold text-slate-800 mb-1">No Active Booking Found</h2>
        <p className="text-sm text-slate-500 max-w-sm mb-6">
          Find an available campus shuttle or submit a ride request to start live trip tracking.
        </p>
        <Button onClick={() => navigate('/student/rides')}>Browse Campus Rides</Button>
      </div>
    )
  }

  // Determine dynamic journey status
  let statusBanner = {
    title: 'Driver is en route to pickup',
    desc: driverStart && driverStart.toLowerCase() !== myPickup.toLowerCase()
      ? `Started from ${driverStart} · Heading to your pickup at ${myPickup}`
      : `Heading to your pickup stop: ${myPickup}`,
    color: 'bg-primary-600',
    badge: 'LIVE',
  }

  if (isDropped) {
    statusBanner = {
      title: 'You have arrived at your destination!',
      desc: `Safely dropped off at ${myDestination}. Thank you for riding with Campus Mobility!`,
      color: 'bg-emerald-600',
      badge: 'COMPLETED',
    }
  } else if (effectiveRide.status === 'waiting' || effectiveRide.status === 'full') {
    statusBanner = {
      title: 'Booking Confirmed — Driver Assigned',
      desc: `Pickup at ${myPickup} · Departs ${effectiveRide.departureTime}`,
      color: 'bg-slate-800',
      badge: 'SCHEDULED',
    }
  } else if (effectiveRide.status === 'boarding') {
    statusBanner = {
      title: 'Boarding in Progress',
      desc: `Driver is boarding passengers at ${myPickupStop?.name || myPickup}`,
      color: 'bg-amber-600',
      badge: 'BOARDING',
    }
  } else if (myPickupStop?.status === 'ARRIVED') {
    statusBanner = {
      title: 'Driver has arrived at your stop!',
      desc: `Meet your shuttle (${vehicle?.name || 'Campus Van'} · ${vehicle?.registration || 'TS 07 UA 1234'}) at ${myPickup}`,
      color: 'bg-emerald-600',
      badge: 'ARRIVED',
    }
  } else if (effectiveRide.status === 'recovery_pending') {
    statusBanner = {
      title: 'Automated Vehicle Reassignment In Progress',
      desc: 'Vehicle assistance active. Nearby replacement shuttle being assigned. Your booking and fare remain secured.',
      color: 'bg-amber-600',
      badge: 'REASSIGNING',
    }
  } else if (isBoarded) {
    statusBanner = {
      title: 'On Trip to Your Destination',
      desc: `Boarded at ${myPickup} · Heading to ${myDestination}`,
      color: 'bg-indigo-600',
      badge: 'IN TRANSIT',
    }
  }

  return (
    <div className="relative h-screen w-full flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Floating Header & SOS */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-auto">
        <button
          onClick={() => navigate(-1)}
          className="bg-white/95 backdrop-blur-md p-2.5 rounded-full shadow-lg text-slate-700 hover:text-slate-900 cursor-pointer transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${effectiveRide.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-primary-500'}`} />
          <span className="text-xs font-bold text-slate-800 tracking-wide">{statusBanner.badge} GPS MONITORING</span>
        </div>

        <button
          onClick={() => navigate('/student/safety')}
          className="bg-red-500 hover:bg-red-600 text-white px-3.5 py-2 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
        >
          <Shield size={15} />
          SOS
        </button>
      </div>

      {/* Route Deviation Banner if active */}
      {(progress?.isOffRoute || effectiveRide.hasDeviation) && (
        <div className="absolute top-20 left-4 right-4 z-20 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-slate-950 flex-shrink-0" />
            <p className="text-xs font-bold">Route deviation detected. Dispatcher & safety monitoring active.</p>
          </div>
          <Button size="sm" variant="secondary" className="text-xs py-1 h-7" onClick={() => navigate('/student/safety')}>
            Safety
          </Button>
        </div>
      )}

      {/* Automated Breakdown Recovery Reassignment Banner */}
      {Boolean(effectiveRide.recoveryId && effectiveRide.status === 'active') && (
        <div className="absolute top-20 left-4 right-4 z-20 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between border border-emerald-400/50 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-white flex-shrink-0" />
            <div>
              <p className="text-xs font-extrabold leading-tight">
                Ride Reassigned to {vehicle?.name || 'Replacement Shuttle'}
              </p>
              <p className="text-[11px] text-emerald-100 font-medium">
                Driver: {driver?.name || 'Assigned Driver'} · Your booking & confirmed fare (₹{currentPassenger?.fare || myBooking?.fare || effectiveRide.fare}) remain secured.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full screen Map */}
      <div className="flex-1 w-full h-full">
        <CampusMap
          origin={
            tripState?.route?.origin ||
            (effectiveRide.startLocation
              ? {
                  lat: effectiveRide.startLocationLat || effectiveRide.currentLat,
                  lng: effectiveRide.startLocationLng || effectiveRide.currentLng,
                  name: effectiveRide.startLocation,
                }
              : undefined)
          }
          highlightStopStudentId={currentUserId || currentStudentId}
          stops={tripState?.stops || effectiveRide.stops || []}
          routeCoordinates={tripState?.route?.geometry || effectiveRide.routeCoordinates || []}
          vehicleLat={vehiclePosition ? vehiclePosition[0] : effectiveRide.currentLat}
          vehicleLng={vehiclePosition ? vehiclePosition[1] : effectiveRide.currentLng}
          vehicleHeading={vehicleHeading}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          onRecenter={recenter}
          height="h-full"
          interactive
          alertMode={progress?.isOffRoute || effectiveRide.hasDeviation}
          showRecenterButton={isRecenterNeeded}
          rideBookedSeats={effectiveRide.bookedSeats}
          rideCapacity={effectiveRide.capacity}
        />
      </div>

      {/* Floating Bottom Sheet */}
      <div className="absolute bottom-4 left-4 right-4 z-20 max-w-lg mx-auto pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 space-y-3">
          {/* Status Pill */}
          <div className={`${statusBanner.color} text-white rounded-xl px-3 py-2 flex items-center justify-between`}>
            <div>
              <div className="font-bold text-xs">{statusBanner.title}</div>
              <div className="text-[11px] text-white/90">{statusBanner.desc}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-base font-extrabold text-white">
                {personalEta}
              </span>
              <div className="text-[10px] text-white/80">
                {isDropped ? 'Dropped Off' : effectiveRide.status === 'active' ? (isBoarded ? 'Dropoff ETA' : 'Pickup ETA') : 'Departure'}
              </div>
            </div>
          </div>

          {/* Journey Itinerary Stepper (Driver Start -> Pickup -> Destination) */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Your Trip Route</span>
              <span className="text-primary-700 font-semibold">
                {myPickup && myDestination && myPickup.toLowerCase() !== myDestination.toLowerCase()
                  ? `${myPickup} → ${myDestination}`
                  : effectiveRide.routeName && !effectiveRide.routeName.includes('→')
                    ? effectiveRide.routeName
                    : `${myPickup} → SRI INDU College`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 relative">
              {/* Step 1: Driver Start */}
              <div className="flex flex-col items-center text-center p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center mb-1">
                  1
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Driver Start</span>
                <span className="text-xs font-bold text-slate-800 line-clamp-1" title={driverStart}>
                  {driverStart}
                </span>
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">
                  {effectiveRide.status === 'active' ? 'En Route' : 'Origin'}
                </span>
              </div>

              {/* Step 2: Passenger Pickup */}
              <div className={`flex flex-col items-center text-center p-2 rounded-lg border shadow-2xs ${
                isBoarded || isDropped
                  ? 'bg-slate-50 border-slate-200 opacity-80'
                  : 'bg-primary-50/50 border-primary-200 ring-2 ring-primary-300/40'
              }`}>
                <div className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center mb-1 ${
                  isBoarded || isDropped
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-primary-600 text-white animate-pulse'
                }`}>
                  {isBoarded || isDropped ? '✓' : '2'}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Your Pickup</span>
                <span className="text-xs font-bold text-slate-800 line-clamp-1" title={myPickup}>
                  {myPickup}
                </span>
                <span className={`text-[9px] font-bold mt-0.5 ${isBoarded ? 'text-slate-500' : 'text-primary-700'}`}>
                  {isBoarded ? 'Boarded' : myPickupStop?.status === 'ARRIVED' ? 'Arrived!' : myPickupStop?.estimatedArrival ? `ETA ${myPickupStop.estimatedArrival}` : 'Pickup'}
                </span>
              </div>

              {/* Step 3: Passenger Dropoff */}
              <div className={`flex flex-col items-center text-center p-2 rounded-lg border shadow-2xs ${
                isDropped
                  ? 'bg-emerald-50 border-emerald-300'
                  : isBoarded
                  ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-300/40'
                  : 'bg-white border-slate-200'
              }`}>
                <div className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center mb-1 ${
                  isDropped
                    ? 'bg-emerald-600 text-white'
                    : isBoarded
                    ? 'bg-indigo-600 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {isDropped ? '✓' : '3'}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Your Dropoff</span>
                <span className="text-xs font-bold text-slate-800 line-clamp-1" title={myDestination}>
                  {myDestination}
                </span>
                <span className={`text-[9px] font-bold mt-0.5 ${
                  isDropped
                    ? 'text-emerald-700'
                    : isBoarded
                    ? 'text-indigo-700'
                    : 'text-slate-400'
                }`}>
                  {isDropped ? 'Arrived' : personalEta ? `ETA ${personalEta}` : 'Destination'}
                </span>
              </div>
            </div>
          </div>

          {/* Ride Details Header */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h3 className="font-heading font-bold text-slate-900 text-base">{effectiveRide.routeName}</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="text-primary-600" />
                <span>Your Destination: <strong className="text-slate-800">{myDestination}</strong></span>
              </p>
            </div>
            <div className="text-right">
              {isDropped ? (
                <Button size="sm" variant="primary" onClick={() => navigate('/student/history')}>
                  View Receipt
                </Button>
              ) : (
                <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-1 rounded-lg">
                  {progress?.remainingDistanceMeters
                    ? `${(progress.remainingDistanceMeters / 1000).toFixed(1)} km away`
                    : `${effectiveRide.distanceKm} km`}
                </span>
              )}
            </div>
          </div>

          {/* Driver brief */}
          {driver && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <Avatar name={driver.name} size="md" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900">{driver.name}</p>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                      ★ {driver.rating || 4.9}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {vehicle?.name || 'Campus Shuttle'} · {vehicle?.registration || 'TS 07 UA 1234'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${driver.phone || '+91 98765 43210'}`}
                  className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                  title="Call Driver"
                >
                  <Phone size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="relative w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center hover:bg-primary-100 transition-colors cursor-pointer"
                  title="Message Driver"
                >
                  <MessageCircle size={16} />
                  {unreadFromDriver > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadFromDriver}
                    </span>
                  )}
                </button>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/student/ride/${activeRide.id}`)}>
                  Details
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Drawer for Live Tracking */}
      {chatOpen && activeRide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setChatOpen(false)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '72vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Avatar name={driver?.name || 'Driver'} size="sm" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-900">{driver?.name ?? 'Assigned Driver'}</p>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                      ★ {driver?.rating || 4.9}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">Direct message to your assigned ride driver</p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {rideMessages.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <MessageCircle size={32} className="mx-auto mb-2 opacity-30 text-primary-500" />
                  <p className="text-xs font-medium text-slate-600">No messages yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Let your driver know where you are waiting!</p>
                </div>
              ) : (
                rideMessages.map((msg) => {
                  const isMe = msg.fromRole === 'student'
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs ${
                          isMe
                            ? 'bg-primary-600 text-white rounded-br-xs'
                            : 'bg-slate-100 text-slate-800 rounded-bl-xs'
                        }`}
                      >
                        {!isMe && (
                          <p className="text-[9px] font-bold text-emerald-700 mb-0.5">
                            {msg.fromName} (Driver)
                          </p>
                        )}
                        <p className="leading-snug">{msg.text}</p>
                        <p
                          className={`text-[9px] mt-0.5 ${
                            isMe ? 'text-primary-200 text-right' : 'text-slate-400'
                          }`}
                        >
                          {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick action chips */}
            <div className="px-4 pb-2 pt-1 flex flex-wrap gap-1.5 border-t border-slate-50">
              {[
                'Where are you?',
                'Waiting at pickup point 📍',
                "I'm at the gate",
                'Be there in 1 min ⏱️',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleSendChat(chip)}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-primary-50 text-slate-700 hover:text-primary-700 rounded-full border border-slate-200 hover:border-primary-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <div className="px-4 py-2.5 border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSending && draft.trim()) {
                    e.preventDefault()
                    handleSendChat()
                  }
                }}
                disabled={isSending}
                placeholder="Message driver..."
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => handleSendChat()}
                disabled={!draft.trim() || isSending}
                className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {isSending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
