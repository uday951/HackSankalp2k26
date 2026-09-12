import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Clock, Users, Navigation, Zap, ArrowLeft, Info, RotateCcw, Map, Sparkles, ShieldCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { LOCATIONS } from '../../data/mockData';
import { CampusMap, MapPoint } from '../../components/map';
import { routingService } from '../../services/routing/routingService';
import { api } from '../../services/api';
import type { FareEstimateResult } from '../../types';
import LocationSearchInput from '../../components/booking/LocationSearchInput';
import { MapLocationPickerModal } from '../../components/booking/MapLocationPickerModal';
import { DepartureTimeSelector, getCurrentRealTime } from '../../components/booking/DepartureTimeSelector';
import SeatsSelector from '../../components/booking/SeatsSelector';
import { PlaceResult, geocodingService } from '../../services/geocoding';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RouteType = 'one-way' | 'recurring';

// ---------------------------------------------------------------------------
// Time slots: 7:00 AM - 9:00 PM in 15-minute intervals
// ---------------------------------------------------------------------------
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 7; hour <= 21; hour++) {
    for (const min of [0, 15, 30, 45]) {
      if (hour === 21 && min > 0) break;
      const period = hour < 12 ? 'AM' : 'PM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const displayMin = min === 0 ? '00' : String(min);
      slots.push(`${displayHour}:${displayMin} ${period}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

// ---------------------------------------------------------------------------
// Campus destination options (dropdown destination)
// ---------------------------------------------------------------------------
const CAMPUS_DESTINATIONS = ['Main Campus', 'Engineering Block', 'Library'];

// ---------------------------------------------------------------------------
// Filter pickup locations - exclude campus destinations
// ---------------------------------------------------------------------------
const PICKUP_LOCATIONS = Object.values(LOCATIONS).filter(
  (loc) => !CAMPUS_DESTINATIONS.includes(loc.name),
);

// ---------------------------------------------------------------------------
// Recurring days
// ---------------------------------------------------------------------------
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BookRide: React.FC = () => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  // Form state
  const [pickupPlace, setPickupPlace] = useState<PlaceResult | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(null);
  const [time, setTime] = useState<string>(() => getCurrentRealTime());
  const [seats, setSeats] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [routeType, setRouteType] = useState<RouteType>('one-way');
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [routeMetrics, setRouteMetrics] = useState<{ distance: string; duration: string } | null>(null);
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean;
    mode: 'pickup' | 'destination';
  }>({ isOpen: false, mode: 'pickup' });

  const [fareEstimate, setFareEstimate] = useState<FareEstimateResult | null>(null);
  const [isEstimatingFare, setIsEstimatingFare] = useState<boolean>(false);

  // Dynamic Fare Estimation from Backend Pricing Engine
  useEffect(() => {
    if (pickupPlace?.lat && pickupPlace?.lng && destinationPlace?.lat && destinationPlace?.lng) {
      setIsEstimatingFare(true);
      api
        .getFareEstimate({
          pickupName: pickupPlace.name,
          pickupLat: pickupPlace.lat,
          pickupLng: pickupPlace.lng,
          destinationName: destinationPlace.name,
          destinationLat: destinationPlace.lat,
          destinationLng: destinationPlace.lng,
          seats,
        })
        .then((res: any) => {
          const fareData = res?.data || res
          if (fareData && typeof fareData.estimatedFare === 'number') {
            setFareEstimate(fareData);
          }
        })
        .catch((err) => {
          console.warn('[BookRide] Fare estimate error:', err?.message);
        })
        .finally(() => {
          setIsEstimatingFare(false);
        });
    } else {
      setFareEstimate(null);
    }
  }, [pickupPlace?.lat, pickupPlace?.lng, destinationPlace?.lat, destinationPlace?.lng, seats]);

  // Memoize map points to ensure stable array references
  const mapPoints = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [];
    if (pickupPlace) {
      pts.push({
        lat: pickupPlace.lat,
        lng: pickupPlace.lng,
        label: pickupPlace.name,
        type: 'pickup',
        stopOrder: 1,
      });
    }
    if (destinationPlace) {
      pts.push({
        lat: destinationPlace.lat,
        lng: destinationPlace.lng,
        label: destinationPlace.name,
        type: 'destination',
      });
    }
    return pts;
  }, [pickupPlace?.lat, pickupPlace?.lng, pickupPlace?.name, destinationPlace?.lat, destinationPlace?.lng, destinationPlace?.name]);

  // Memoized route calculated callback - only updates state if metrics actually changed
  const handleRouteCalculated = useCallback((dist: number, dur: number) => {
    const distanceStr = routingService.formatDistance(dist);
    const durationStr = routingService.formatDuration(dur);
    setRouteMetrics((prev) => {
      if (prev && prev.distance === distanceStr && prev.duration === durationStr) {
        return prev; // Prevents unnecessary re-render!
      }
      return { distance: distanceStr, duration: durationStr };
    });
  }, []);

  // Stable initial location for picker modal
  const pickerInitialLocation = useMemo(() => {
    if (pickerModal.mode === 'pickup' && pickupPlace) {
      return { lat: pickupPlace.lat, lng: pickupPlace.lng };
    }
    if (pickerModal.mode === 'destination' && destinationPlace) {
      return { lat: destinationPlace.lat, lng: destinationPlace.lng };
    }
    return null;
  }, [pickerModal.mode, pickupPlace?.lat, pickupPlace?.lng, destinationPlace?.lat, destinationPlace?.lng]);

  // Interactive map click reverse geocoding
  const handleMapLocationSelect = async (lat: number, lng: number) => {
    try {
      const place = await geocodingService.reverseGeocode(lat, lng);
      if (!pickupPlace) {
        setPickupPlace(place);
        setErrors((prev) => ({ ...prev, pickup: '' }));
        toast.success(`Selected "${place.name}" as Pickup`, { icon: '📍' });
      } else if (!destinationPlace) {
        setDestinationPlace(place);
        setErrors((prev) => ({ ...prev, destination: '' }));
        toast.success(`Selected "${place.name}" as Destination`, { icon: '🏁' });
      } else {
        setPickupPlace(place);
        setErrors((prev) => ({ ...prev, pickup: '' }));
        toast.success(`Updated Pickup to "${place.name}"`, { icon: '📍' });
      }
    } catch {
      toast(`Selected point: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, { icon: '📍' });
    }
  };

  // Browser Geolocation
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const place = await geocodingService.reverseGeocode(latitude, longitude);
          const userLoc: PlaceResult = {
            ...place,
            name: place.name || 'Current Location (GPS)',
            lat: latitude,
            lng: longitude,
          };
          setPickupPlace(userLoc);
          setErrors((prev) => ({ ...prev, pickup: '' }));
          toast.success('Pickup set to your current GPS position!', { icon: '🎯' });
        } catch {
          const userLoc: PlaceResult = {
            id: `loc-gps-${latitude.toFixed(4)}-${longitude.toFixed(4)}`,
            name: 'Current Location (GPS)',
            address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            lat: latitude,
            lng: longitude,
            type: 'pin',
          };
          setPickupPlace(userLoc);
          setErrors((prev) => ({ ...prev, pickup: '' }));
          toast.success('Pickup set to your current GPS position!', { icon: '🎯' });
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        toast.error('Location permission denied. Please enter a pickup location or select on the map.', { duration: 4000 });
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Toggle recurring days
  const toggleDay = (day: string) => {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!pickupPlace) newErrors.pickup = 'Please enter a pickup location.';
    if (!destinationPlace) newErrors.destination = 'Please select a destination.';
    if (pickupPlace && destinationPlace && pickupPlace.name.trim().toLowerCase() === destinationPlace.name.trim().toLowerCase()) {
      newErrors.destination = 'Pickup and destination cannot be the same location.';
      toast.error('Pickup and destination cannot be the same location.');
    }
    if (!time) newErrors.time = 'Please select a departure time.';
    if (routeType === 'recurring' && recurringDays.length === 0)
      newErrors.days = 'Select at least one recurring day.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Navigate to matching
  const handleFindRide = () => {
    if (!validate() || !pickupPlace || !destinationPlace) return;
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
      routeType,
      ...(notes ? { notes } : {}),
      ...(routeType === 'recurring' ? { days: recurringDays.join(',') } : {}),
    });
    navigate(`/student/matching?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* ------------------------------------------------------------------ */}
      {/* Top bar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Book a Ride</h1>
            <p className="text-xs text-slate-500">Find the best shared ride to campus</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Info card                                                          */}
        {/* ---------------------------------------------------------------- */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
          <div className="p-4 flex gap-3 items-start">
            <div className="p-2 bg-white/20 rounded-xl shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm mb-1">Smart Ride Matching</p>
              <p className="text-xs text-blue-100 leading-relaxed">
                Our AI-powered engine matches you with the best shared ride based on your
                route, timing, pickup proximity, and co-passenger ratings &mdash; saving you time
                and money every day.
              </p>
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Route type toggle                                                  */}
        {/* ---------------------------------------------------------------- */}
        <Card className="p-5 border border-slate-200 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">Trip Type</p>
          <div className="grid grid-cols-2 gap-2">
            {(['one-way', 'recurring'] as RouteType[]).map((type) => (
              <button
                key={type}
                onClick={() => setRouteType(type)}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2 ${
                  routeType === type
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {type === 'one-way' ? (
                  <Navigation className="w-4 h-4" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {type === 'one-way' ? 'One-Way' : 'Recurring'}
              </button>
            ))}
          </div>

          {/* Recurring days */}
          {routeType === 'recurring' && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">Select Days</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      recurringDays.includes(day)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {errors.days && (
                <p className="text-red-500 text-xs mt-1">{errors.days}</p>
              )}
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Interactive OpenStreetMap + Leaflet preview                       */}
        {/* ---------------------------------------------------------------- */}
        <Card className="p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-blue-600" />
              Route & Campus Map
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPickerModal({ isOpen: true, mode: 'pickup' })}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors shadow-2xs"
                title="Select pickup on map"
              >
                <Map className="w-3.5 h-3.5 text-emerald-600" />
                Pin Pickup
              </button>
              <button
                type="button"
                onClick={() => setPickerModal({ isOpen: true, mode: 'destination' })}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shadow-2xs"
                title="Select destination on map"
              >
                <Map className="w-3.5 h-3.5 text-red-600" />
                Pin Drop
              </button>
            </div>
          </div>

          <CampusMap
            points={mapPoints}
            height="h-60"
            className="rounded-xl"
            interactive={true}
            selectable={true}
            enableCurrentLocation={true}
            onLocationSelect={handleMapLocationSelect}
            onRouteCalculated={handleRouteCalculated}
          />

          {pickupPlace && destinationPlace && routeMetrics && (
            <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="font-semibold text-blue-900">
                  {pickupPlace.name} → {destinationPlace.name}
                </span>
              </div>
              <div className="flex items-center gap-2 font-medium text-slate-700">
                <span className="font-bold text-slate-900">{routeMetrics.duration}</span>
                <span>·</span>
                <span>{routeMetrics.distance}</span>
                <span className="bg-white px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 border border-slate-200">OSRM</span>
              </div>
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Main booking form                                                  */}
        {/* ---------------------------------------------------------------- */}
        <Card className="p-5 border border-slate-200 shadow-sm space-y-5">
          {/* Real Pickup Place Search */}
          <LocationSearchInput
            label="Pickup Location"
            placeholder="Enter pickup address"
            value={pickupPlace ? pickupPlace.name : ''}
            selectedPlace={pickupPlace}
            onSelectPlace={(place) => {
              setPickupPlace(place);
              setErrors((prev) => ({ ...prev, pickup: '' }));
            }}
            onClear={() => setPickupPlace(null)}
            onUseCurrentLocation={handleUseCurrentLocation}
            onChooseOnMap={() => setPickerModal({ isOpen: true, mode: 'pickup' })}
            error={errors.pickup}
            iconColor="text-green-500"
          />

          {/* Arrow divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100" />
            <div className="p-2 bg-blue-50 rounded-full">
              <Navigation className="w-4 h-4 text-blue-500 rotate-90" />
            </div>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Real Destination Place Search */}
          <LocationSearchInput
            label="Destination"
            placeholder="Search destination: e.g. SRI INDU College, Airport, Station..."
            value={destinationPlace ? destinationPlace.name : ''}
            selectedPlace={destinationPlace}
            onSelectPlace={(place) => {
              setDestinationPlace(place);
              setErrors((prev) => ({ ...prev, destination: '' }));
            }}
            onClear={() => setDestinationPlace(null)}
            onChooseOnMap={() => setPickerModal({ isOpen: true, mode: 'destination' })}
            error={errors.destination}
            iconColor="text-red-500"
          />

          {/* Departure Time with Auto Real-Time & Manual Options */}
          <DepartureTimeSelector
            value={time}
            onChange={(val) => {
              setTime(val);
              setErrors((prev) => ({ ...prev, time: '' }));
            }}
            error={errors.time}
          />

          {/* Seats */}
          <SeatsSelector
            value={seats}
            onChange={(val) => setSeats(val)}
            label="Number of Seats"
          />

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Info className="w-4 h-4 text-slate-400" />
                Notes{' '}
                <span className="text-slate-400 font-normal">(optional)</span>
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements? e.g. 'Prefer female co-passengers', 'AC vehicle preferred'..."
              rows={3}
              maxLength={200}
              className="input-field w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
            <p className="text-xs text-slate-400 text-right mt-1">{notes.length}/200</p>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Dynamic Fare Estimate Card                                        */}
        {/* ---------------------------------------------------------------- */}
        {fareEstimate ? (
          <Card className="p-4 border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Estimated Shared Fare
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-heading font-extrabold text-slate-900">
                    ₹{fareEstimate.estimateRange.min} – ₹{fareEstimate.estimateRange.max}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    ({fareEstimate.distanceKm} km · ~{fareEstimate.durationMinutes} min)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="w-3 h-3" />
                  Route-Optimized
                </span>
                {fareEstimate.isHaversineFallback && (
                  <p className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-0.5">
                    <Info className="w-3 h-3" />
                    Approx. (OSRM unavailable)
                  </p>
                )}
                {fareEstimate.sharedSavings > 0 && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Save up to ₹{fareEstimate.sharedSavings}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-emerald-100 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/70 rounded-lg p-1.5">
                <span className="text-[10px] text-slate-500 block">Base + Distance</span>
                <span className="font-bold text-slate-800">
                  ₹{fareEstimate.breakdown.baseFare + fareEstimate.breakdown.distanceFare}
                </span>
              </div>
              <div className="bg-white/70 rounded-lg p-1.5">
                <span className="text-[10px] text-slate-500 block">Shared Savings</span>
                <span className="font-bold text-emerald-600">
                  -₹{fareEstimate.breakdown.sharedSavings || 0}
                </span>
              </div>
              <div className="bg-white/70 rounded-lg p-1.5">
                <span className="text-[10px] text-slate-500 block">Target Fare</span>
                <span className="font-bold text-slate-900">
                  ₹{fareEstimate.estimatedFare}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 mt-2 leading-tight">
              {fareEstimate.explanation}
            </p>
          </Card>
        ) : isEstimatingFare ? (
          <Card className="p-4 border border-blue-200 bg-blue-50 shadow-sm flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-xs text-blue-800 font-medium">
              Calculating road route and shared pooling fare via OSRM & Pricing Engine...
            </p>
          </Card>
        ) : (
          <Card className="p-4 border border-slate-200 bg-slate-50 shadow-sm">
            <div className="flex gap-3 items-start">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-800 mb-0.5">Dynamic Fair Fare Guarantee</p>
                <p>
                  Every passenger pays their own individual fare based on exact road distance, duration, and shared route efficiency.
                  Select pickup and destination to preview your instant estimate.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CTA                                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="pb-8">
          <Button
            onClick={handleFindRide}
            className="w-full py-4 text-base font-bold rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Zap className="w-5 h-5" />
            Find Shared Ride
          </Button>
          <p className="text-center text-xs text-slate-400 mt-3">
            We'll find the best match in seconds using smart route analysis
          </p>
        </div>
      </div>

      {/* Rapido-Style Interactive Pin Map Picker Modal */}
      <MapLocationPickerModal
        isOpen={pickerModal.isOpen}
        mode={pickerModal.mode}
        initialLocation={pickerInitialLocation}
        onConfirm={(place) => {
          if (pickerModal.mode === 'pickup') {
            setPickupPlace(place);
            setErrors((prev) => ({ ...prev, pickup: '' }));
            toast.success(`Pickup set: ${place.name}`, { icon: '📍' });
          } else {
            setDestinationPlace(place);
            setErrors((prev) => ({ ...prev, destination: '' }));
            toast.success(`Destination set: ${place.name}`, { icon: '🏁' });
          }
          setPickerModal((prev) => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setPickerModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default BookRide;