import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Users, ChevronRight, Zap, Navigation, Map, Shield
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { CampusMap, MapPoint, VehicleData } from '../../components/map'
import { routingService } from '../../services/routing/routingService'
import LocationSearchInput from '../../components/booking/LocationSearchInput'
import { MapLocationPickerModal } from '../../components/booking/MapLocationPickerModal'
import { DepartureTimeSelector, getCurrentRealTime } from '../../components/booking/DepartureTimeSelector'
import SeatsSelector from '../../components/booking/SeatsSelector'
import { PlaceResult, geocodingService } from '../../services/geocoding'
import toast from 'react-hot-toast'

const POPULAR_DESTINATIONS: PlaceResult[] = [
  {
    id: 'loc-sri-indu',
    name: 'SRI INDU College',
    address: 'Sheriguda, Ibrahimpatnam, R.R. Dist, Telangana',
    lat: 17.2063,
    lng: 78.6015,
    type: 'college',
  },
  {
    id: 'loc-airport',
    name: 'Rajiv Gandhi Airport',
    address: 'Shamshabad, Hyderabad, Telangana',
    lat: 17.2403,
    lng: 78.4294,
    type: 'transit',
  },
  {
    id: 'loc-secunderabad',
    name: 'Secunderabad Station',
    address: 'Station Rd, Secunderabad, Telangana',
    lat: 17.4344,
    lng: 78.5017,
    type: 'transit',
  },
  {
    id: 'loc-hitech',
    name: 'Hitech City Cyber Towers',
    address: 'Madhapur, Hitech City, Hyderabad',
    lat: 17.4504,
    lng: 78.3808,
    type: 'hub',
  },
  {
    id: 'loc-kukatpally',
    name: 'Kukatpally Metro',
    address: 'KPHB Colony, Hyderabad, Telangana',
    lat: 17.4934,
    lng: 78.3995,
    type: 'transit',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const rides = useAppStore((s) => s.rides)
  const currentStudent = useAppStore((s) => s.currentStudent())
  const currentStudentId = useAppStore((s) => s.currentStudentId)
  const bookings = useAppStore((s) => s.bookings)
  const drivers = useAppStore((s) => s.drivers)
  const vehicles = useAppStore((s) => s.vehicles)

  // Real place search states
  const [pickupPlace, setPickupPlace] = useState<PlaceResult | null>(null)
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(null)
  const [time, setTime] = useState<string>(() => getCurrentRealTime())
  const [seats, setSeats] = useState<number>(1)
  const [genderPreference, setGenderPreference] = useState<'ANYONE' | 'FEMALE_ONLY'>('ANYONE')
  const [routeMetrics, setRouteMetrics] = useState<{ distance: string; duration: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Rapido map picker modal state
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean
    mode: 'pickup' | 'destination'
  }>({ isOpen: false, mode: 'pickup' })

  // Find active ride for the logged-in student (strictly active or boarding status)
  const userActiveRide = rides.find((r) => {
    if (r.status !== 'active' && r.status !== 'boarding') return false
    const hasBooking = bookings.some(
      (b) => b.studentId === currentStudentId && b.rideId === r.id && b.status === 'confirmed'
    )
    const isPassenger = r.passengers?.some(
      (p) => p.studentId === currentStudentId && (p.status === 'boarded' || p.status === 'waiting')
    )
    return hasBooking || isPassenger
  })

  // Find upcoming scheduled ride (booked by student but not yet started)
  const userUpcomingRide = !userActiveRide
    ? rides.find((r) => {
        if (r.status !== 'waiting') return false
        const hasBooking = bookings.some(
          (b) => b.studentId === currentStudentId && b.rideId === r.id && b.status === 'confirmed'
        )
        const isPassenger = r.passengers?.some(
          (p) => p.studentId === currentStudentId && p.status === 'waiting'
        )
        return hasBooking || isPassenger
      })
    : null


  // Map fleet vehicles to VehicleData for CampusMap
  const fleetVehicles: VehicleData[] = useMemo(() => {
    const activeRides = rides.filter(
      (r) => r.date === 'today' && r.status !== 'completed' && r.status !== 'cancelled'
    )
    return activeRides.map((r) => {
      const v = vehicles.find((veh) => veh.id === r.vehicleId)
      const d = drivers.find((drv) => drv.id === r.driverId)
      return {
        id: r.vehicleId,
        name: v ? v.name : 'Campus Shuttle',
        capacity: r.capacity,
        bookedSeats: r.bookedSeats,
        status: (r.status === 'active' ? 'ON_TRIP' : 'AVAILABLE') as any,
        lat: r.currentLat,
        lng: r.currentLng,
        driverName: d ? d.name : 'Staff Driver',
        isDeviated: r.hasDeviation,
        isAlert: r.hasSosAlert || r.hasDeviation,
      }
    })
  }, [rides, vehicles, drivers])

  // Stable map points
  const mapPoints = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = []
    if (pickupPlace) {
      pts.push({
        lat: pickupPlace.lat,
        lng: pickupPlace.lng,
        label: pickupPlace.name,
        type: 'pickup',
        stopOrder: 1,
      })
    }
    if (destinationPlace) {
      pts.push({
        lat: destinationPlace.lat,
        lng: destinationPlace.lng,
        label: destinationPlace.name,
        type: 'destination',
      })
    }
    return pts
  }, [pickupPlace?.lat, pickupPlace?.lng, pickupPlace?.name, destinationPlace?.lat, destinationPlace?.lng, destinationPlace?.name])

  // Stable route metrics callback
  const handleRouteCalculated = useCallback((dist: number, dur: number) => {
    const distanceStr = routingService.formatDistance(dist)
    const durationStr = routingService.formatDuration(dur)
    setRouteMetrics((prev) => {
      if (prev && prev.distance === distanceStr && prev.duration === durationStr) {
        return prev
      }
      return { distance: distanceStr, duration: durationStr }
    })
  }, [])

  // Stable initial location for picker modal
  const pickerInitialLocation = useMemo(() => {
    if (pickerModal.mode === 'pickup' && pickupPlace) {
      return { lat: pickupPlace.lat, lng: pickupPlace.lng }
    }
    if (pickerModal.mode === 'destination' && destinationPlace) {
      return { lat: destinationPlace.lat, lng: destinationPlace.lng }
    }
    return null
  }, [pickerModal.mode, pickupPlace?.lat, pickupPlace?.lng, destinationPlace?.lat, destinationPlace?.lng])

  // Map click reverse geocoding
  const handleMapLocationSelect = async (lat: number, lng: number) => {
    try {
      const place = await geocodingService.reverseGeocode(lat, lng)
      if (!pickupPlace) {
        setPickupPlace(place)
        setErrors((prev) => ({ ...prev, pickup: '' }))
        toast.success(`Selected "${place.name}" as Pickup`, { icon: '📍' })
      } else if (!destinationPlace) {
        setDestinationPlace(place)
        setErrors((prev) => ({ ...prev, destination: '' }))
        toast.success(`Selected "${place.name}" as Destination`, { icon: '🏁' })
      } else {
        setPickupPlace(place)
        setErrors((prev) => ({ ...prev, pickup: '' }))
        toast.success(`Updated Pickup to "${place.name}"`, { icon: '📍' })
      }
    } catch {
      toast(`Selected point: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, { icon: '📍' })
    }
  }

  // Browser Geolocation
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const place = await geocodingService.reverseGeocode(latitude, longitude)
          const userLoc: PlaceResult = {
            ...place,
            name: place.name || 'Current Location (GPS)',
            lat: latitude,
            lng: longitude,
          }
          setPickupPlace(userLoc)
          setErrors((prev) => ({ ...prev, pickup: '' }))
          toast.success('Pickup set to your current GPS position!', { icon: '🎯' })
        } catch {
          const userLoc: PlaceResult = {
            id: `loc-gps-${latitude.toFixed(4)}-${longitude.toFixed(4)}`,
            name: 'Current Location (GPS)',
            address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            lat: latitude,
            lng: longitude,
            type: 'pin',
          }
          setPickupPlace(userLoc)
          setErrors((prev) => ({ ...prev, pickup: '' }))
          toast.success('Pickup set to your current GPS position!', { icon: '🎯' })
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message)
        toast.error('Location permission denied. Please enter a pickup location or select on the map.', { duration: 4000 })
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const handleFind = () => {
    if (!pickupPlace) {
      setErrors((prev) => ({ ...prev, pickup: 'Please enter a pickup location.' }))
      return
    }
    if (!destinationPlace) {
      setErrors((prev) => ({ ...prev, destination: 'Please select a destination.' }))
      return
    }
    if (pickupPlace.name.trim().toLowerCase() === destinationPlace.name.trim().toLowerCase()) {
      setErrors((prev) => ({ ...prev, destination: 'Pickup and destination cannot be the same location.' }))
      toast.error('Pickup and destination cannot be the same location.')
      return
    }

    const params = new URLSearchParams({
      pickup: pickupPlace.name,
      pickupAddress: pickupPlace.address || '',
      pickupLat: String(pickupPlace.lat),
      pickupLng: String(pickupPlace.lng),
      destination: destinationPlace.name,
      destinationAddress: destinationPlace.address || '',
      destinationLat: String(destinationPlace.lat),
      destinationLng: String(destinationPlace.lng),
      time,
      seats: String(seats),
      genderPreference,
    })
    navigate(`/student/matching?${params.toString()}`)
  }

  return (
    <div className="min-h-screen w-full px-4 pt-6 pb-6 space-y-5 max-w-2xl mx-auto">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium">{greeting},</p>
          <h1 className="font-heading font-bold text-xl text-slate-900">{currentStudent?.name ?? 'Student'}</h1>
        </div>
        <Badge variant="blue" size="sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1 inline-block" />
          Live Fleet
        </Badge>
      </div>

      {/* Small Contextual Active Trip Shortcut */}
      {userActiveRide && (() => {
        const userBooking = bookings.find(
          (b) => b.studentId === currentStudentId && b.rideId === userActiveRide.id && b.status === 'confirmed'
        )
        const userPassenger = userActiveRide.passengers?.find(
          (p) => p.studentId === currentStudentId && (p.status === 'boarded' || p.status === 'waiting')
        )
        const pName = userBooking?.pickup || userPassenger?.pickup || userActiveRide.pickupPoints?.[0]?.name || userActiveRide.startLocation || 'Pickup'
        const dName = userBooking?.destination || userPassenger?.destination || userActiveRide.destination || 'SRI INDU College'
        const isSame = pName.trim().toLowerCase() === dName.trim().toLowerCase()
        const displayRoute = !isSame
          ? `${pName} → ${dName}`
          : `${pName} → SRI INDU College`

        return (
          <div
            onClick={() => navigate(`/student/live?rideId=${userActiveRide.id}`)}
            className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-md cursor-pointer hover:from-emerald-700 hover:to-teal-800 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <div className="truncate text-xs">
                <p className="font-bold truncate text-sm">Active Ride: {displayRoute}</p>
                <p className="text-[11px] text-emerald-100 truncate">
                  In Transit · Destination: {!isSame ? dName : 'SRI INDU College'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white/20 group-hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0 ml-2 transition-colors">
              <span>Track Ride</span>
              <ChevronRight size={14} />
            </div>
          </div>
        )
      })()}

      {/* Upcoming Scheduled Ride Shortcut */}
      {userUpcomingRide && (() => {
        const userBooking = bookings.find(
          (b) => b.studentId === currentStudentId && b.rideId === userUpcomingRide.id && b.status === 'confirmed'
        )
        const userPassenger = userUpcomingRide.passengers?.find(
          (p) => p.studentId === currentStudentId && p.status === 'waiting'
        )
        const pName = userBooking?.pickup || userPassenger?.pickup || userUpcomingRide.pickupPoints?.[0]?.name || userUpcomingRide.startLocation || 'Pickup'
        const dName = userBooking?.destination || userPassenger?.destination || userUpcomingRide.destination || 'SRI INDU College'
        const isSame = pName.trim().toLowerCase() === dName.trim().toLowerCase()
        const displayRoute = !isSame
          ? `${pName} → ${dName}`
          : `${pName} → SRI INDU College`

        return (
          <div
            onClick={() => navigate(`/student/ride/${userUpcomingRide.id}`)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-md cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock size={16} className="text-blue-200 shrink-0" />
              <div className="truncate text-xs">
                <p className="font-bold truncate text-sm">Upcoming Trip: {displayRoute}</p>
                <p className="text-[11px] text-blue-100 truncate">
                  Scheduled · Departs {userUpcomingRide.departureTime} · {!isSame ? dName : 'SRI INDU College'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white/20 group-hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0 ml-2 transition-colors">
              <span>View Details</span>
              <ChevronRight size={14} />
            </div>
          </div>
        )
      })()}

      {/* ---------------------------------------------------------------- */}
      {/* Booking Card — shown FIRST, map moved below                      */}
      {/* ---------------------------------------------------------------- */}
      <Card padding="lg" className="w-full border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="font-heading font-bold text-slate-900 text-2xl">Where are you going?</h2>
          <p className="text-xs text-slate-400 mt-0.5">Smart Ride Pooling · Share the route, not the wait</p>
        </div>

        <div className="space-y-3">
          {/* Pickup Search */}
          <LocationSearchInput
            label="Pickup Location"
            placeholder="Enter pickup address"
            value={pickupPlace ? pickupPlace.name : ''}
            selectedPlace={pickupPlace}
            onSelectPlace={(place) => {
              setPickupPlace(place)
              setErrors((prev) => ({ ...prev, pickup: '' }))
            }}
            onClear={() => setPickupPlace(null)}
            onUseCurrentLocation={handleUseCurrentLocation}
            onChooseOnMap={() => setPickerModal({ isOpen: true, mode: 'pickup' })}
            error={errors.pickup}
            iconColor="text-emerald-500"
          />

          {/* Arrow Divider */}
          <div className="flex items-center gap-2 py-0.5">
            <div className="flex-1 h-px bg-slate-100" />
            <div className="p-1.5 bg-blue-50 rounded-full">
              <Navigation className="w-3.5 h-3.5 text-blue-500 rotate-90" />
            </div>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Destination Search */}
          <div>
            <LocationSearchInput
              label="Destination"
              placeholder="Search destination: e.g. Airport, Station, Metro, Campus..."
              value={destinationPlace ? destinationPlace.name : ''}
              selectedPlace={destinationPlace}
              onSelectPlace={(place) => {
                setDestinationPlace(place)
                setErrors((prev) => ({ ...prev, destination: '' }))
              }}
              onClear={() => setDestinationPlace(null)}
              onChooseOnMap={() => setPickerModal({ isOpen: true, mode: 'destination' })}
              error={errors.destination}
              iconColor="text-red-500"
            />

            {/* Quick Destination Suggestions */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2">
              <span className="text-[11px] font-semibold text-slate-400 shrink-0">Popular:</span>
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => {
                    setDestinationPlace(dest)
                    setErrors((prev) => ({ ...prev, destination: '' }))
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all shrink-0 cursor-pointer ${
                    destinationPlace?.id === dest.id
                      ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {dest.name}
                </button>
              ))}
            </div>
          </div>

          {/* Departure Time */}
          <div className="pt-1 space-y-3">
            <DepartureTimeSelector
              value={time}
              onChange={(val) => setTime(val)}
              error={errors.time}
            />

            <SeatsSelector
              value={seats}
              onChange={(val) => setSeats(val)}
            />
          </div>

          {/* Passenger Preference */}
          <div className="pt-1">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Shield size={13} className="text-purple-500" />
                Passenger Group Preference
              </span>
              <span className="text-[10px] text-purple-600 font-medium">Safety Filter</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGenderPreference('ANYONE')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  genderPreference === 'ANYONE'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-2xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Users size={14} />
                Anyone
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currentStudent?.gender?.toLowerCase() === 'male') {
                    toast.error('The Female Passengers Only pool is reserved for female students/faculty.')
                    return
                  }
                  setGenderPreference('FEMALE_ONLY')
                }}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  genderPreference === 'FEMALE_ONLY'
                    ? 'border-pink-500 bg-pink-50 text-pink-700 shadow-2xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Shield size={14} className="text-pink-500" />
                Female Passengers Only
              </button>
            </div>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full mt-2 py-3.5 text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-200"
          onClick={handleFind}
        >
          <Zap size={17} />
          Find Shared Ride
        </Button>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Live Campus Map — shown BELOW the booking card                   */}
      {/* ---------------------------------------------------------------- */}
      <Card className="w-full p-3.5 border border-slate-200 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-semibold text-slate-800">Campus Route & Shuttle Radar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPickerModal({ isOpen: true, mode: 'pickup' })}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Map className="w-3.5 h-3.5 text-emerald-600" />
              Pin Pickup
            </button>
            <button
              type="button"
              onClick={() => setPickerModal({ isOpen: true, mode: 'destination' })}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Map className="w-3.5 h-3.5 text-red-600" />
              Pin Drop
            </button>
          </div>
        </div>
        <CampusMap
          points={mapPoints}
          vehicles={fleetVehicles}
          height="h-72"
          className="rounded-xl shadow-inner w-full"
          interactive={true}
          selectable={true}
          enableCurrentLocation={true}
          onLocationSelect={handleMapLocationSelect}
          onRouteCalculated={handleRouteCalculated}
        />
        {pickupPlace && destinationPlace && routeMetrics && (
          <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
              <span className="font-semibold text-blue-900 truncate">{pickupPlace.name} → {destinationPlace.name}</span>
            </div>
            <div className="flex items-center gap-2 font-medium text-slate-700 shrink-0 ml-2">
              <span className="font-bold text-slate-900">{routeMetrics.duration}</span>
              <span>·</span>
              <span>{routeMetrics.distance}</span>
              <span className="bg-white px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 border border-slate-200">OSRM</span>
            </div>
          </div>
        )}
      </Card>

      {/* Map Picker Modal */}
      <MapLocationPickerModal
        isOpen={pickerModal.isOpen}
        mode={pickerModal.mode}
        initialLocation={pickerInitialLocation}
        onConfirm={(place) => {
          if (pickerModal.mode === 'pickup') {
            setPickupPlace(place)
            setErrors((prev) => ({ ...prev, pickup: '' }))
            toast.success(`Pickup set: ${place.name}`, { icon: '📍' })
          } else {
            setDestinationPlace(place)
            setErrors((prev) => ({ ...prev, destination: '' }))
            toast.success(`Destination set: ${place.name}`, { icon: '🏁' })
          }
          setPickerModal((prev) => ({ ...prev, isOpen: false }))
        }}
        onClose={() => setPickerModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
