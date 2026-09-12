import React, { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Navigation, MapPin, Clock, ArrowRight, ShieldCheck,
  Phone, MessageCircle, Send, X,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { api } from '../../services/api'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import SeatProgress from '../../components/ui/SeatProgress'
import { resolveDriverInfo } from '../../utils/driverDirectory'

export default function BookingConfirmation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const rides = useAppStore((s) => s.rides)
  const drivers = useAppStore((s) => s.drivers)
  const currentStudentId = useAppStore((s) => s.currentStudentId)
  const currentUser = useAppStore((s) => s.currentUser)
  const bookings = useAppStore((s) => s.bookings)
  const messages = useAppStore((s) => s.messages)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const markMessagesRead = useAppStore((s) => s.markMessagesRead)
  const fetchRideMessages = useAppStore((s) => s.fetchRideMessages)
  const refreshRides = useAppStore((s) => s.refreshRides)

  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Ensure rides are loaded
  useEffect(() => {
    refreshRides()
  }, [refreshRides])

  // If page is refreshed and ride is not in store, fetch it directly
  useEffect(() => {
    if (id && (!rides.length || !rides.some((r) => r.id === id))) {
      api.getRide(id).then((r) => {
        if (r) {
          useAppStore.setState((s) => ({
            rides: [r, ...s.rides.filter((ex) => ex.id !== r.id)],
          }))
        }
      }).catch(() => {})
    }
  }, [id, rides.length])

  const ride = rides.find((r) => r.id === id)
  const driverInfo = resolveDriverInfo(ride?.driverId, (ride as any)?.driverName, drivers)
  const matchedDriver = ride ? drivers.find((d) => d.id === ride.driverId) : undefined
  const driver = matchedDriver || {
    id: ride?.driverId || driverInfo.id,
    name: (ride as any)?.driverName && !(ride as any).driverName.toLowerCase().includes('campus driver')
      ? (ride as any).driverName
      : driverInfo.name,
    phone: (ride as any)?.driverPhone || driverInfo.phone,
    rating: (ride as any)?.driverRating || driverInfo.rating,
    totalTrips: driverInfo.totalTrips,
    avatar: (ride as any)?.driverAvatar || driverInfo.avatar,
  }
  const rideMessages = messages.filter((m) => m.rideId === id)
  const unreadFromDriver = rideMessages.filter((m) => m.fromRole === 'driver' && !m.read).length

  useEffect(() => {
    if (id) fetchRideMessages(id)
  }, [id])

  useEffect(() => {
    if (chatOpen && id) {
      markMessagesRead(id, 'driver')
      fetchRideMessages(id)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [chatOpen, rideMessages.length])

  const handleSend = async (customText?: string) => {
    const textToSend = (typeof customText === 'string' ? customText : draft).trim()
    if (!textToSend || !id || isSending) return
    setIsSending(true)
    setDraft('')
    try {
      await sendMessage(id, textToSend, ride?.driverId, myBooking?.id)
    } finally {
      setIsSending(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  if (!ride) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-heading font-bold text-slate-800">Booking confirmed</h2>
        <Button className="mt-4" onClick={() => navigate('/student/home')}>Return to Home</Button>
      </div>
    )
  }

  const isFull = ride.bookedSeats >= ride.capacity
  const studentId = currentUser?.id || currentStudentId
  const myBooking = bookings.find((b) => b.rideId === ride.id && (b.studentId === studentId || b.studentId === currentStudentId))
  const myPassenger = ride.passengers.find((p) => p.studentId === studentId || p.studentId === currentStudentId)
  const mySeat = myPassenger ? myPassenger.seatNo : (myBooking?.seatNo || ride.bookedSeats)
  const myDestination = myBooking?.destination || (myPassenger as any)?.destination || ride.destination
  const myFare = myPassenger?.fare || myBooking?.fare || ride.fare

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-16">
      {/* Success Icon */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <CheckCircle2 size={36} />
        </div>
        <Badge variant="green" size="md" className="mb-2">Confirmed Booking</Badge>
        <h1 className="font-heading font-bold text-3xl text-slate-900">You're booked!</h1>
        <p className="text-slate-500 text-sm mt-1">Intelligent dispatch has secured your seat</p>
      </div>

      {/* Main Confirmation Card */}
      <Card className="mb-5 overflow-hidden border-2 border-primary-200" padding="none">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-5 text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-primary-200 uppercase tracking-wider">Ride Assigned</p>
              <h2 className="text-xl font-heading font-bold">{ride.routeName}</h2>
            </div>
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
              Seat #{mySeat}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Seat Status */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold text-slate-700">Capacity Status</span>
              {isFull ? (
                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  RIDE FULL · BOOKING CLOSED
                </span>
              ) : (
                <span className="text-xs font-bold text-primary-700">
                  {ride.bookedSeats}/{ride.capacity} seats filled
                </span>
              )}
            </div>
            <SeatProgress filled={ride.bookedSeats} total={ride.capacity} showLabel={false} size="md" />
            {isFull && (
              <p className="text-xs font-medium text-slate-600 mt-2 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-green-600 flex-shrink-0" />
                This vehicle reached 100% occupancy. Zero wasted campus vehicle capacity!
              </p>
            )}
          </div>

          {/* Ride Details */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                <Clock size={16} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">Departure Time</p>
                <p className="font-semibold text-slate-800">{ride.departureTime} (Departs in 8 min)</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                <MapPin size={16} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">Designated Pickup</p>
                <p className="font-semibold text-slate-800">{myPassenger?.pickup || ride.pickupPoints[0]?.name || 'Designated Pickup'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
                <Navigation size={16} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">Destination</p>
                <p className="font-semibold text-slate-800">{myDestination}</p>
              </div>
            </div>

            {/* Driver row with phone */}
            {driver && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                  {driver.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">Driver</p>
                  <p className="font-semibold text-slate-800">{driver.name} · {driver.rating} ★</p>
                  {driver.phone && (
                    <a href={`tel:${driver.phone}`} className="text-xs text-primary-600 font-medium hover:underline flex items-center gap-1 mt-0.5">
                      <Phone size={11} /> {driver.phone}
                    </a>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-400">Locked Fare</p>
                  <p className="font-bold text-slate-900 text-base">₹{myFare}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Call + Message row */}
        {driver && (
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`tel:${driver.phone}`}
              className="flex items-center justify-center gap-2 h-10 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors"
            >
              <Phone size={15} /> Call Driver
            </a>
            <button
              onClick={() => setChatOpen(true)}
              className="relative flex items-center justify-center gap-2 h-10 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 text-sm font-semibold hover:bg-primary-100 transition-colors cursor-pointer"
            >
              <MessageCircle size={15} /> Message Driver
              {unreadFromDriver > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadFromDriver}
                </span>
              )}
            </button>
          </div>
        )}

        <Button size="lg" variant="primary" className="w-full shadow-lg" onClick={() => navigate(`/student/live?rideId=${ride.id}`)}>
          Track Live Ride <ArrowRight size={18} />
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="w-full" onClick={() => navigate('/student/rides')}>My Rides</Button>
          <Button variant="secondary" className="w-full" onClick={() => navigate('/student/home')}>Return Home</Button>
        </div>
      </div>

      {/* Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setChatOpen(false)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chat Header */}
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

            {/* Messages */}
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

            {/* Quick chips */}
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

            {/* Input */}
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
