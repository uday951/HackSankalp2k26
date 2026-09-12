import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  MapPin, Clock, Users, Shield, Star, ChevronLeft, Car, CheckCircle2,
  AlertCircle, ArrowRight, DollarSign, Calendar, Sparkles, Info, ShieldCheck, Phone
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import SeatProgress from '../../components/ui/SeatProgress'
import CampusMap from '../../components/map/CampusMap'
import { getRideStatusBadge, getRideStatusLabel } from '../../lib/utils'
import { api } from '../../services/api'
import { Ride, FareBreakdown } from '../../types'
import { resolveDriverInfo } from '../../utils/driverDirectory'
import toast from 'react-hot-toast'

export default function RideDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isBooking, setIsBooking] = useState(false)

  const rides = useAppStore((s) => s.rides)
  const drivers = useAppStore((s) => s.drivers)
  const vehicles = useAppStore((s) => s.vehicles)
  const currentStudentId = useAppStore((s) => s.currentStudentId)
  const currentStudent = useAppStore((s) => s.currentStudent())
  const joinRide = useAppStore((s) => s.joinRide)

  const [remoteRide, setRemoteRide] = useState<Ride | null>(null)
  const [loadingRide, setLoadingRide] = useState(!rides.some((r) => r.id === id))
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null)
  const [fareAmount, setFareAmount] = useState<number | null>(null)
  const [isLockedFare, setIsLockedFare] = useState<boolean>(false)

  useEffect(() => {
    if (id && !rides.some((r) => r.id === id)) {
      setLoadingRide(true)
      api.getRide(id)
        .then((fetched) => {
          if (fetched) {
            setRemoteRide(fetched)
            useAppStore.setState((s) => ({
              rides: s.rides.some((r) => r.id === fetched.id) ? s.rides : [...s.rides, fetched],
            }))
          }
        })
        .catch((err) => console.warn('[RideDetail] Failed to fetch remote ride:', err))
        .finally(() => setLoadingRide(false))
    }
  }, [id, rides])

  const ride = rides.find((r) => r.id === id) || remoteRide
  const isPassenger = Boolean(ride?.passengers?.some((p) => p.studentId === currentStudentId || p.studentId === currentStudent?.id))
  const requestedPickup = searchParams.get('pickup') || ride?.pickupPoints?.[0]?.name || 'Pickup Point'
  const requestedDestination = searchParams.get('destination') || ride?.destination || 'Destination' 
  const requestedPickupLat = Number(searchParams.get('pickupLat')) || undefined
  const requestedPickupLng = Number(searchParams.get('pickupLng')) || undefined
  const requestedDestLat = Number(searchParams.get('destinationLat')) || undefined
  const requestedDestLng = Number(searchParams.get('destinationLng')) || undefined
  const requestedPickupAddress = searchParams.get('pickupAddress') || requestedPickup
  const requestedDestAddress = searchParams.get('destinationAddress') || requestedDestination

  // Fetch individual fare: from existing booking if passenger, or backend estimate if joining
  useEffect(() => {
    if (!ride) return

    const myPassenger = ride.passengers?.find((p) => p.studentId === currentStudentId)
    if (myPassenger && myPassenger.fare) {
      setFareAmount(myPassenger.fare)
      setIsLockedFare(true)
    }

    // Load full fare breakdown from backend
    if (isPassenger) {
      api.getRideFares(ride.id).then((res: any) => {
        const fareData = res?.data || res
        if (fareData?.passengers) {
          const myFare = fareData.passengers.find((p: any) => p.studentId === currentStudentId)
          if (myFare) {
            setFareAmount(myFare.fare)
            setFareBreakdown(myFare.fareBreakdown)
            setIsLockedFare(myFare.isLocked)
          }
        }
      }).catch((err) => console.warn('[RideDetail] Could not load ride fares:', err))
    } else {
      // Calculate dynamic fare estimate using exact pickup & destination
      const pLat = requestedPickupLat || ride.pickupPoints?.[0]?.lat || 17.398
      const pLng = requestedPickupLng || ride.pickupPoints?.[0]?.lng || 78.479
      const dLat = requestedDestLat || ride.destinationLat || 17.2063
      const dLng = requestedDestLng || ride.destinationLng || 78.6015

      api.getFareEstimate({
        pickupName: requestedPickup,
        pickupLat: pLat,
        pickupLng: pLng,
        destinationName: requestedDestination,
        destinationLat: dLat,
        destinationLng: dLng,
        seats: 1,
        rideId: ride.id,
      }).then((res: any) => {
        const fareData = res?.data || res
        if (fareData && typeof fareData.estimatedFare === 'number') {
          setFareAmount(fareData.estimatedFare)
          if (fareData.breakdown) {
            setFareBreakdown(fareData.breakdown)
          }
        }
      }).catch((err) => console.warn('[RideDetail] Dynamic fare estimate failed:', err))
    }
  }, [ride?.id, currentStudentId, isPassenger, requestedPickupLat, requestedPickupLng, requestedDestLat, requestedDestLng])

  if (loadingRide && !ride) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading ride details...</p>
      </div>
    )
  }

  if (!ride) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-heading font-bold text-slate-800 mb-2">Ride Not Found</h2>
        <p className="text-sm text-slate-500 mb-6">The ride you're looking for does not exist or has finished.</p>
        <Button onClick={() => navigate('/student/home')}>Return Home</Button>
      </div>
    )
  }

  const driverInfo = resolveDriverInfo(ride.driverId, (ride as any).driverName, drivers)
  const matchedDriver = drivers.find((d) => d.id === ride.driverId)
  const driver = matchedDriver || {
    id: ride.driverId || driverInfo.id,
    name: (ride as any).driverName && !(ride as any).driverName.toLowerCase().includes('campus driver')
      ? (ride as any).driverName
      : driverInfo.name,
    phone: (ride as any).driverPhone || driverInfo.phone,
    rating: (ride as any).driverRating || driverInfo.rating,
    totalTrips: driverInfo.totalTrips,
    avatar: (ride as any).driverAvatar || driverInfo.avatar,
  }
  const matchedVehicle = vehicles.find((v) => v.id === ride.vehicleId)
  const vehicle = matchedVehicle || {
    id: ride.vehicleId || driverInfo.vehicleId,
    name: (ride as any).vehicleName || driverInfo.vehicleName,
    registration: (ride as any).vehiclePlate || driverInfo.vehicleRegistration,
    type: driverInfo.vehicleType,
  }
  const isFull = ride.bookedSeats >= ride.capacity
  const availableSeats = ride.capacity - ride.bookedSeats

  const isFemaleOnlyRide = Boolean(
    ride.isFemaleOnly ||
    ride.genderPreference === 'FEMALE_ONLY' ||
    ride.passengers?.some((p) => p.genderPreference === 'FEMALE_ONLY')
  )
  const isMaleStudent = currentStudent?.gender?.toLowerCase() === 'male'
  const isGenderRestricted = isFemaleOnlyRide && isMaleStudent

  const mapPoints = [
    {
      lat: requestedPickupLat || ride.pickupPoints[0]?.lat || 17.398,
      lng: requestedPickupLng || ride.pickupPoints[0]?.lng || 78.479,
      label: requestedPickup,
      type: 'pickup' as const,
    },
    {
      lat: requestedDestLat || ride.destinationLat,
      lng: requestedDestLng || ride.destinationLng,
      label: requestedDestination || ride.destination,
      type: 'destination' as const,
    },
    {
      lat: ride.currentLat,
      lng: ride.currentLng,
      label: vehicle?.name || 'Vehicle',
      type: 'vehicle' as const,
    }
  ]

  const handleConfirmJoin = async () => {
    if (isGenderRestricted) {
      toast.error('This ride is restricted to female passengers only.')
      return
    }
    setIsBooking(true)
    try {
      const pickupCoords = requestedPickupLat && requestedPickupLng
        ? { lat: requestedPickupLat, lng: requestedPickupLng }
        : undefined
      const destinationCoords = requestedDestLat && requestedDestLng
        ? { lat: requestedDestLat, lng: requestedDestLng }
        : undefined
      const genderPref = searchParams.get('genderPreference') || (isFemaleOnlyRide ? 'FEMALE_ONLY' : 'ANYONE')
      await joinRide(
        ride.id,
        currentStudentId,
        requestedPickup,
        requestedDestination,
        pickupCoords,
        destinationCoords,
        requestedPickupAddress,
        requestedDestAddress,
        genderPref
      )
      setIsBooking(false)
      setShowConfirm(false)
      toast.success('Successfully joined ride!', { icon: '🎉' })
      navigate(`/student/confirmation/${ride.id}`)
    } catch (err: any) {
      setIsBooking(false)
      toast.error(err.message || 'Failed to join ride')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <Badge variant={ride.status === 'active' ? 'green' : ride.status === 'boarding' ? 'yellow' : ride.status === 'full' ? 'slate' : 'blue'}>
          {getRideStatusLabel(ride.status)}
        </Badge>
      </div>

      {/* Female-only safety alert banner */}
      {isFemaleOnlyRide && (
        <div className="mb-4 p-4 bg-pink-50 border border-pink-200 rounded-2xl flex items-start gap-3 shadow-xs">
          <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0 text-pink-600 font-bold text-base">
            ♀
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-pink-900">Female Passengers Only Pool</h4>
              <span className="bg-pink-200/80 text-pink-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Strict Safety Policy
              </span>
            </div>
            <p className="text-xs text-pink-700 mt-1 leading-relaxed">
              This shared ride is reserved exclusively for female students and faculty. All male passenger bookings are automatically restricted.
            </p>
            {isMaleStudent && (
              <div className="mt-2 text-xs font-semibold text-rose-700 bg-rose-100/80 p-2 rounded-lg border border-rose-200">
                ⚠️ Your account is registered as Male ({currentStudent?.name}). You cannot join this female-only ride.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Title & Route summary */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading font-bold text-2xl text-slate-900">{ride.routeName}</h1>
          <span className="text-xl font-heading font-bold text-primary-700" title="Individual fare calculated by backend pricing engine">
            {fareAmount !== null ? `₹${fareAmount}` : '…'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <Calendar size={13} className="text-slate-400" />
          Today · Departs {ride.departureTime} (ETA {ride.estimatedArrival || '30 mins'})
        </p>
      </div>

      {/* Live Map Preview */}
      <div className="mb-4 shadow-sm rounded-2xl overflow-hidden border border-slate-200">
        <CampusMap
          points={mapPoints}
          routeCoordinates={ride.routeCoordinates}
          vehicleLat={ride.currentLat}
          vehicleLng={ride.currentLng}
          height="h-52"
          rideBookedSeats={ride.bookedSeats}
          rideCapacity={ride.capacity}
        />
      </div>

      {/* Seat Filling Progress Card */}
      <Card className="mb-4" padding="md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Dynamic Capacity</span>
          {isFull ? (
            <Badge variant="red" size="sm">RIDE FULL</Badge>
          ) : (
            <Badge variant="green" size="sm">{availableSeats} seat{availableSeats > 1 ? 's' : ''} left</Badge>
          )}
        </div>
        <SeatProgress filled={ride.bookedSeats} total={ride.capacity} size="lg" />
        <p className="text-xs text-slate-400 mt-2">
          {isFull
            ? 'Booking closed automatically because all capacity has been filled.'
            : 'Intelligent pooling keeps this route open until all seats are booked.'}
        </p>
      </Card>

      {/* Driver & Vehicle Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {driver && (
          <Card padding="md">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Assigned Driver</p>
            <div className="flex items-center gap-3">
              <Avatar name={driver.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{driver.name}</p>
                  <Shield size={13} className="text-green-600" />
                </div>
                {driver.phone && (
                  <a
                    href={`tel:${driver.phone}`}
                    className="flex items-center gap-1 text-xs text-primary-600 font-medium hover:underline mt-0.5"
                  >
                    <Phone size={11} className="flex-shrink-0" />
                    {driver.phone}
                  </a>
                )}
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <Star size={12} className="text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-slate-700">{driver.rating}</span>
                  <span>({driver.totalTrips} campus trips)</span>
                </div>
                {isPassenger && (
                  <button
                    onClick={() => navigate(`/student/confirmation/${ride.id}`)}
                    className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Message Driver</span>
                  </button>
                )}
              </div>
            </div>
          </Card>
        )}

        {vehicle && (
          <Card padding="md">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Vehicle Info</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">
                <Car size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{vehicle.name}</p>
                  <Badge variant="green" size="sm">Verified</Badge>
                </div>
                <p className="text-xs text-slate-500 truncate">{vehicle.type} · {vehicle.registration}</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Route Pickup Sequence */}
      <Card className="mb-4" padding="md">
        <h3 className="font-heading font-semibold text-slate-900 text-sm mb-3">Planned Stops & Timeline</h3>
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {ride.pickupPoints.map((pt, idx) => (
            <div key={pt.id || idx} className="relative">
              <span className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-primary-600 bg-white" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{pt.name}</span>
                <span className="text-xs font-semibold text-primary-700">{pt.estimatedPickupTime}</span>
              </div>
              <p className="text-[11px] text-slate-400">Designated Student Pickup Bay</p>
            </div>
          ))}
          <div className="relative">
            <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-100" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">{requestedDestination || ride.destination}</span>
              <span className="text-xs font-semibold text-green-700">{ride.estimatedArrival || 'Arrival'}</span>
            </div>
            <p className="text-[11px] text-slate-400">Your Dropoff Destination</p>
          </div>
        </div>
      </Card>

      {/* Current Co-Passengers */}
      <Card className="mb-6" padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-slate-900 text-sm">
            Co-Passengers ({ride.passengers.length}/{ride.capacity})
          </h3>
          <span className="text-xs text-slate-400">University Verified</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ride.passengers.map((p) => {
            const isMe = p.studentId === currentStudentId
            return (
              <div
                key={p.studentId}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                  isMe ? 'bg-primary-50/70 border-primary-200' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <Avatar name={p.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {p.name} {isMe && '(You)'}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">From {p.pickup} · Seat #{p.seatNo}</p>
                </div>
                <Badge variant={p.status === 'boarded' ? 'green' : 'yellow'} size="sm">
                  {p.status}
                </Badge>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Passenger Fare Details Card (Section 17) */}
      <Card className="mb-24" padding="md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-heading font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              <Sparkles size={15} className="text-primary-600" />
              {isLockedFare ? 'Confirmed Fare Receipt' : 'Estimated Fare Breakdown'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isLockedFare ? 'Price locked & guaranteed' : 'Route-calculated individual passenger fare'}
            </p>
          </div>
          {isLockedFare ? (
            <Badge variant="green" size="sm">
              <ShieldCheck size={12} /> Confirmed
            </Badge>
          ) : (
            <Badge variant="blue" size="sm">
              Dynamic Pooling
            </Badge>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
          {fareBreakdown ? (
            <>
              <div className="flex justify-between text-slate-600">
                <span>Base fare</span>
                <span className="font-mono font-medium">₹{fareBreakdown.baseFare}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Distance ({fareBreakdown.metrics.distanceKm} km)</span>
                <span className="font-mono font-medium">₹{fareBreakdown.distanceFare}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Travel time ({fareBreakdown.metrics.durationMinutes} min)</span>
                <span className="font-mono font-medium">₹{fareBreakdown.durationFare}</span>
              </div>
              {fareBreakdown.routeContribution > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Route contribution</span>
                  <span className="font-mono font-medium">+₹{fareBreakdown.routeContribution}</span>
                </div>
              )}
              {fareBreakdown.demandAdjustment !== 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Demand adjustment ({fareBreakdown.metrics.demandTier})</span>
                  <span className="font-mono font-medium">
                    {fareBreakdown.demandAdjustment > 0 ? `+₹${fareBreakdown.demandAdjustment}` : `-₹${Math.abs(fareBreakdown.demandAdjustment)}`}
                  </span>
                </div>
              )}
              {fareBreakdown.sharedSavings > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Shared ride savings ({fareBreakdown.metrics.routeOverlapPercent}% overlap)</span>
                  <span className="font-mono">-₹{fareBreakdown.sharedSavings}</span>
                </div>
              )}
              {fareBreakdown.aiAdvice && fareBreakdown.aiAdvice.appliedAdjustmentPercent !== 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>AI Advisory Adjustment</span>
                  <span className="font-mono">
                    {fareBreakdown.aiAdvice.appliedAdjustmentPercent! > 0
                      ? `+${fareBreakdown.aiAdvice.appliedAdjustmentPercent}%`
                      : `${fareBreakdown.aiAdvice.appliedAdjustmentPercent}%`}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-bold text-slate-900 text-sm">
                <span>Final fare</span>
                <span className="text-xl font-heading text-primary-700 font-extrabold">
                  ₹{fareAmount !== null ? fareAmount : ride.fare}
                </span>
              </div>
              {fareBreakdown.explanation && (
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/60 leading-relaxed italic">
                  {fareBreakdown.explanation}
                </p>
              )}
            </>
          ) : fareAmount !== null ? (
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Estimated Fare</span>
                <span className="font-mono font-medium text-slate-900">₹{fareAmount}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Full breakdown loading from backend pricing engine…
              </p>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-bold text-slate-900 text-sm">
                <span>Total fare</span>
                <span className="text-xl font-heading text-primary-700 font-extrabold">
                  ₹{fareAmount}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-1" />
              <p className="text-xs text-slate-500">Calculating your individual fare…</p>
            </div>
          )}
        </div>
      </Card>

      {/* Bottom Floating CTA Bar */}
      <div className="fixed bottom-16 lg:bottom-4 left-0 right-0 max-w-2xl mx-auto px-4 z-30">
        <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 font-medium">
              {isLockedFare ? 'Confirmed Fare' : 'Your Fare'}
            </p>
            <p className="text-xl font-heading font-bold text-slate-900">
              {fareAmount !== null ? `₹${fareAmount}` : '…'}
            </p>
          </div>

          {isPassenger ? (
            <div className="flex items-center gap-2">
              <Badge variant="green" size="md">
                <CheckCircle2 size={14} /> You're Booked
              </Badge>
              <Button size="md" onClick={() => navigate(`/student/live?rideId=${ride.id}`)}>
                Track Trip
              </Button>
            </div>
          ) : isFull ? (
            <Button size="md" disabled variant="secondary">
              Ride Full
            </Button>
          ) : isGenderRestricted ? (
            <div className="text-right">
              <Button size="md" disabled variant="secondary" className="bg-pink-50 text-pink-700 border-pink-200 cursor-not-allowed">
                <Shield size={15} className="text-pink-600 mr-1" />
                Female Only Restricted
              </Button>
            </div>
          ) : (
            <Button size="md" variant="green" onClick={() => setShowConfirm(true)}>
              Join This Ride
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Join Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <Card className="w-full max-w-md bg-white overflow-hidden shadow-2xl animate-slide-up" padding="none">
            <div className="p-6 bg-gradient-to-br from-primary-600 to-primary-800 text-white">
              <Badge variant="blue" className="bg-white/20 text-white border-transparent mb-2">
                Intelligent Pooled Ride
              </Badge>
              <h3 className="font-heading font-bold text-xl text-white">Join Shared Ride?</h3>
              <p className="text-primary-100 text-xs mt-1">{ride.routeName} · Automated Match</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2.5 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Route:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {requestedPickup} → {ride.destination}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Passengers:</span>
                  <span className="font-semibold text-primary-700">
                    {ride.bookedSeats} → {ride.bookedSeats + 1} / {ride.capacity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Your Seat:</span>
                  <span className="font-semibold text-slate-900">Passenger #{ride.bookedSeats + 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estimated Departure:</span>
                  <span className="font-medium text-slate-800">{ride.departureTime}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="font-semibold text-slate-700">Estimated Fare:</span>
                  <span className="font-heading font-bold text-lg text-green-600">
                    {fareAmount !== null ? `₹${fareAmount}` : 'Calculating…'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowConfirm(false)}
                  disabled={isBooking}
                >
                  Cancel
                </Button>
                <Button
                  variant="green"
                  className="flex-1"
                  onClick={handleConfirmJoin}
                  loading={isBooking}
                >
                  Confirm Booking
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
