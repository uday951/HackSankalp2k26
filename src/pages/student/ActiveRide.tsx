import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Phone, Shield, Navigation, Clock, MapPin, AlertTriangle,
  XCircle, CheckCircle2, MessageCircle, Send, X,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import SeatProgress from '../../components/ui/SeatProgress'
import CampusMap from '../../components/map/CampusMap'
import { resolveDriverInfo } from '../../utils/driverDirectory'

export default function ActiveRide() {
  const navigate = useNavigate()
  const rides = useAppStore((s) => s.rides)
  const drivers = useAppStore((s) => s.drivers)
  const vehicles = useAppStore((s) => s.vehicles)
  const currentStudentId = useAppStore((s) => s.currentStudentId)
  const cancelBooking = useAppStore((s) => s.cancelBooking)
  const bookings = useAppStore((s) => s.bookings)
  const messages = useAppStore((s) => s.messages)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const markMessagesRead = useAppStore((s) => s.markMessagesRead)
  const fetchRideMessages = useAppStore((s) => s.fetchRideMessages)

  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const refreshRides = useAppStore((s) => s.refreshRides)

  // Refresh rides on mount
  useEffect(() => {
    refreshRides()
  }, [refreshRides])

  // Find ride where student has a confirmed active, boarding, waiting, or full ride
  const activeRide = rides.find((r) => {
    if (r.status === 'completed' || r.status === 'cancelled') return false
    const hasBooking = bookings.some(
      (b) => b.studentId === currentStudentId && b.rideId === r.id && (b.status === 'confirmed' || b.status === 'pending')
    )
    const isPassenger = r.passengers?.some(
      (p) => p.studentId === currentStudentId && (p.status === 'boarded' || p.status === 'waiting')
    )
    return hasBooking || isPassenger
  })

  if (!activeRide) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Navigation size={48} className="mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-heading font-bold text-slate-800">No Active Ride</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">You don't have an active or upcoming trip right now.</p>
        <Button onClick={() => navigate('/student/book')}>Book a Ride</Button>
      </div>
    )
  }

  const driverInfo = resolveDriverInfo(activeRide?.driverId, (activeRide as any)?.driverName, drivers)
  const matchedDriver = activeRide ? drivers.find((d) => d.id === activeRide.driverId) : undefined
  const driver = matchedDriver || {
    id: activeRide?.driverId || driverInfo.id,
    name: (activeRide as any)?.driverName && !(activeRide as any).driverName.toLowerCase().includes('campus driver')
      ? (activeRide as any).driverName
      : driverInfo.name,
    phone: (activeRide as any)?.driverPhone || driverInfo.phone,
    rating: (activeRide as any)?.driverRating || driverInfo.rating,
    totalTrips: driverInfo.totalTrips,
    avatar: (activeRide as any)?.driverAvatar || driverInfo.avatar,
  }
  const matchedVehicle = vehicles.find((v) => v.id === activeRide?.vehicleId)
  const vehicle = matchedVehicle || {
    id: activeRide?.vehicleId || driverInfo.vehicleId,
    name: (activeRide as any)?.vehicleName || driverInfo.vehicleName,
    registration: (activeRide as any)?.vehiclePlate || driverInfo.vehicleRegistration,
    vehicleType: driverInfo.vehicleType,
  }
  const myBooking = bookings.find((b) => b.rideId === activeRide.id && b.studentId === currentStudentId && b.status === 'confirmed')
  const rideMessages = messages.filter((m) => m.rideId === activeRide.id)
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

  const handleSend = async (customText?: string) => {
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

  const mapPoints = [
    ...activeRide.pickupPoints.map((pp) => ({
      lat: pp.lat,
      lng: pp.lng,
      label: pp.name,
      type: 'pickup' as const,
    })),
    {
      lat: activeRide.destinationLat,
      lng: activeRide.destinationLng,
      label: activeRide.destination,
      type: 'destination' as const,
    },
    {
      lat: activeRide.currentLat,
      lng: activeRide.currentLng,
      label: 'Campus Van',
      type: 'vehicle' as const,
    }
  ]

  const handleCancel = () => {
    if (myBooking) {
      cancelBooking(myBooking.id)
    }
    navigate('/student/home')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-20 lg:pb-8">
      {/* Route deviation alert if triggered */}
      {activeRide.hasDeviation && (
        <div className="mb-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3 shadow-md animate-pulse">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-heading font-bold text-sm text-red-800">Route Deviation Detected</h4>
            <p className="text-xs text-red-700 mt-0.5">
              Your ride has moved away from the planned route. Campus security and dispatch have been alerted.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="danger" onClick={() => navigate('/student/safety')}>
                Open Safety Center
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">Live Trip Status</span>
          <h1 className="font-heading font-bold text-2xl text-slate-900">{activeRide.routeName}</h1>
        </div>
        <Badge variant={activeRide.status === 'active' ? 'green' : activeRide.status === 'boarding' ? 'yellow' : 'blue'}>
          {activeRide.status === 'active' ? 'Driver on the way' : activeRide.status === 'boarding' ? 'Boarding now' : 'Scheduled'}
        </Badge>
      </div>

      {/* Interactive Map */}
      <div className="relative mb-4 rounded-2xl overflow-hidden shadow-sm border border-slate-200">
        <CampusMap
          points={mapPoints}
          routeCoordinates={activeRide.routeCoordinates}
          vehicleLat={activeRide.currentLat}
          vehicleLng={activeRide.currentLng}
          height="h-64"
          interactive
          rideBookedSeats={activeRide.bookedSeats}
          rideCapacity={activeRide.capacity}
        />
        {/* Floating ETA Badge */}
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl shadow-md border border-slate-200 flex items-center gap-2">
          <Clock size={14} className="text-primary-600" />
          <span className="text-xs font-bold text-slate-900">
            {activeRide.estimatedArrival ? `ETA: ${activeRide.estimatedArrival}` : 'En Route'}
          </span>
        </div>
      </div>

      {/* Next Pickup Card */}
      {(() => {
        const nextStop = activeRide.stops?.find((s: any) => s.status === 'UPCOMING' || s.status === 'ARRIVING' || s.status === 'ARRIVED') || activeRide.pickupPoints?.[0]
        const nextStopName = nextStop?.name || activeRide.destination || 'Campus Destination'
        return (
          <Card className="mb-4 bg-gradient-to-r from-primary-50 to-white border-primary-200" padding="md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center flex-shrink-0">
                  <MapPin size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-primary-700 uppercase tracking-wider">Next Stop</p>
                  <p className="font-heading font-bold text-slate-900 text-sm">{nextStopName}</p>
                  <p className="text-[11px] text-slate-500">
                    {(nextStop as any)?.estimatedPickupTime || (nextStop as any)?.time ? `Estimated: ${(nextStop as any).estimatedPickupTime || (nextStop as any).time}` : `Heading to ${activeRide.destination}`}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/student/live?rideId=${activeRide.id}`)}>
                Full Screen
              </Button>
            </div>
          </Card>
        )
      })()}

      {/* Driver & Vehicle Card */}
      {driver && vehicle && (
        <Card className="mb-4" padding="md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={driver.name} size="lg" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-semibold text-slate-900 text-sm">{driver.name}</h3>
                  <Badge variant="green" size="sm">Verified</Badge>
                </div>
                <p className="text-xs text-slate-500">{vehicle.name} · {vehicle.registration}</p>
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">★ {driver.rating} · Verified Driver ({driver.totalTrips || 150}+ trips)</p>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="text-xs text-primary-600 font-medium hover:underline flex items-center gap-1 mt-0.5">
                    <Phone size={11} /> {driver.phone}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`tel:${driver.phone}`}
                className="w-9 h-9 rounded-full bg-green-50 text-green-600 border border-green-200 flex items-center justify-center hover:bg-green-100 transition-colors"
                title="Call Driver"
              >
                <Phone size={16} />
              </a>
              <button
                onClick={() => setChatOpen(true)}
                className="relative w-9 h-9 rounded-full bg-primary-50 text-primary-600 border border-primary-200 flex items-center justify-center hover:bg-primary-100 transition-colors cursor-pointer"
                title="Message Driver"
              >
                <MessageCircle size={16} />
                {unreadFromDriver > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadFromDriver}</span>
                )}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Dynamic Seat Capacity */}
      <Card className="mb-6" padding="md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">Vehicle Occupancy</span>
          <span className="text-xs font-bold text-slate-800">{activeRide.bookedSeats} / {activeRide.capacity} Seats Filled</span>
        </div>
        <SeatProgress filled={activeRide.bookedSeats} total={activeRide.capacity} showLabel={false} size="sm" />
      </Card>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Button
          variant="secondary"
          className="flex items-center justify-center gap-2"
          onClick={() => navigate(`/student/live?rideId=${activeRide.id}`)}
        >
          <Navigation size={16} />
          Track Live
        </Button>
        <Button
          variant="secondary"
          className="flex items-center justify-center gap-2"
          onClick={() => navigate('/student/safety')}
        >
          <Shield size={16} className="text-green-600" />
          Safety Center
        </Button>
      </div>

      <div className="text-center">
        <button
          onClick={handleCancel}
          className="text-xs text-red-600 font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
        >
          <XCircle size={13} />
          Cancel this booking
        </button>
      </div>

      {/* Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setChatOpen(false)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                  {driver?.name.charAt(0) ?? 'D'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{driver?.name ?? 'Driver'}</p>
                  <p className="text-[10px] text-slate-400">Ride chat · messages visible to driver</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {rideMessages.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">No messages yet. Say hi to your driver!</p>
              )}
              {rideMessages.map((msg) => {
                const isMe = msg.fromRole === 'student'
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>
                      <p>{msg.text}</p>
                      <p className={`text-[10px] mt-0.5 ${isMe ? 'text-primary-200' : 'text-slate-400'}`}>
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
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
                  onClick={() => handleSend(chip)}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-primary-50 text-slate-700 hover:text-primary-700 rounded-full border border-slate-200 hover:border-primary-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSending && draft.trim()) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={isSending}
                placeholder="Message driver..."
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:bg-slate-50"
              />
              <button
                onClick={() => handleSend()}
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
