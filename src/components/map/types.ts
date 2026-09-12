export type PointType = 'pickup' | 'destination' | 'vehicle' | 'waypoint' | 'userLocation' | 'selectedLocation'

export interface MapPoint {
  lat: number
  lng: number
  label: string
  type: PointType
  stopOrder?: number
  time?: string
  subtitle?: string
}

export interface VehicleData {
  id: string
  name: string
  capacity: number
  bookedSeats: number
  status: 'AVAILABLE' | 'ON_TRIP' | 'MAINTENANCE' | 'OFFLINE'
  lat: number
  lng: number
  driverName?: string
  isDeviated?: boolean
  isAlert?: boolean
}

export interface MultiRouteData {
  id: string
  name: string
  color: string
  coordinates: [number, number][]
  vehicleId?: string
  status?: string
  stops?: any[]
  isSelected?: boolean
}

export interface CampusMapProps {
  center?: [number, number]
  zoom?: number
  points?: MapPoint[]
  routeCoordinates?: [number, number][]
  multiRoutes?: MultiRouteData[]
  selectedRouteId?: string
  onRouteSelect?: (routeId: string) => void
  vehicles?: VehicleData[]
  vehicleLat?: number
  vehicleLng?: number
  vehicleHeading?: number
  cameraMode?: 'FOLLOW' | 'OVERVIEW' | 'FREE_EXPLORE'
  onCameraModeChange?: (mode: 'FOLLOW' | 'OVERVIEW' | 'FREE_EXPLORE') => void
  stops?: any[]
  splitRoute?: { completed: [number, number][]; remaining: [number, number][] }
  showRecenterButton?: boolean
  onRecenter?: () => void
  interactive?: boolean
  height?: string
  className?: string
  selectable?: boolean
  selectedCoordinate?: [number, number] | null
  onLocationSelect?: (lat: number, lng: number) => void
  onRouteCalculated?: (distanceMeters: number, durationSeconds: number) => void
  enableCurrentLocation?: boolean
  alertMode?: boolean
  showRouteInfo?: boolean
  autoFit?: boolean
  origin?: { lat: number; lng: number; name?: string }
  highlightStopStudentId?: string
  rideBookedSeats?: number
  rideCapacity?: number
}
