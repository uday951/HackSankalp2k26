import mongoose, { Schema, Document } from 'mongoose'

export type RideStatus =
  | 'waiting'
  | 'boarding'
  | 'active'
  | 'full'
  | 'completed'
  | 'cancelled'
  | 'recovery_pending'
  | 'recovered'

export interface IPickupPoint {
  id: string
  name: string
  lat: number
  lng: number
  estimatedPickupTime: string
}

export interface IPassenger {
  studentId: string
  name: string
  pickup: string
  destination?: string
  status: 'waiting' | 'boarded' | 'dropped'
  seatNo: number
  fare?: number
  fareId?: string
  bookingId?: string
  gender?: string
  genderPreference?: string
}

export type StopType = 'PICKUP' | 'DROPOFF'
export type StopStatus =
  | 'UPCOMING'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'BOARDED'
  | 'COMPLETED'
  | 'DROPPED_OFF'
  | 'PENDING'
  | 'DEPARTED'
  | 'SKIPPED'

export interface IRouteStop {
  id: string
  bookingId?: string
  studentId?: string
  type: StopType
  name: string
  address?: string
  latitude: number
  longitude: number
  sequence: number
  status: StopStatus
  estimatedArrival?: string
  actualArrival?: Date
}

export interface IRouteStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number
  maneuverType: string
  roadName?: string
}

export interface ITripRoute {
  version: number
  origin: { lat: number; lng: number; name?: string }
  destination: { lat: number; lng: number; name?: string }
  geometry: [number, number][]
  distanceMeters: number
  durationSeconds: number
  remainingDistanceMeters: number
  remainingDurationSeconds: number
  progressPercent: number
  currentStopIndex: number
  status: 'PLANNED' | 'NAVIGATING' | 'OFF_ROUTE' | 'REROUTING' | 'ARRIVING' | 'COMPLETED'
  steps?: IRouteStep[]
}

export interface IRide extends Document {
  id: string
  routeName: string
  driverId: string
  vehicleId: string
  pickupPoints: IPickupPoint[]
  stops?: IRouteStop[]
  tripRoute?: ITripRoute
  destination: string
  destinationLat: number
  destinationLng: number
  departureTime: string
  estimatedArrival: string
  capacity: number
  bookedSeats: number
  passengers: IPassenger[]
  status: RideStatus
  fare: number
  totalFareAmount?: number
  averageFare?: number
  totalSharedSavings?: number
  demandLevel?: 'LOW' | 'NORMAL' | 'HIGH'
  routeCoordinates: [number, number][]
  currentLat: number
  currentLng: number
  distanceKm: number
  distanceMeters?: number
  durationSeconds?: number
  hasDeviation: boolean
  hasSosAlert: boolean
  isFemaleOnly?: boolean
  genderPreference?: 'ANYONE' | 'FEMALE_ONLY'
  startLocation?: string
  startLocationLat?: number
  startLocationLng?: number
  recoveryId?: string
  originalVehicleId?: string
  originalDriverId?: string
  breakdownLocation?: { lat: number; lng: number; timestamp?: Date }
  driverName?: string
  driverPhone?: string
  driverRating?: number
  driverAvatar?: string
  vehicleName?: string
  vehiclePlate?: string
  date: string
  createdAt: Date
  updatedAt: Date
}

const RideSchema = new Schema<IRide>(
  {
    id: { type: String, required: true, unique: true, index: true },
    routeName: { type: String, required: true },
    driverId: { type: String, required: true, index: true },
    driverName: { type: String },
    driverPhone: { type: String },
    driverRating: { type: Number },
    driverAvatar: { type: String },
    vehicleId: { type: String, required: true },
    vehicleName: { type: String },
    vehiclePlate: { type: String },
    recoveryId: { type: String, index: true },
    originalVehicleId: { type: String },
    originalDriverId: { type: String },
    breakdownLocation: {
      lat: { type: Number },
      lng: { type: Number },
      timestamp: { type: Date },
    },
    pickupPoints: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        estimatedPickupTime: { type: String, required: true },
      },
    ],
    destination: { type: String, required: true, index: true },
    destinationLat: { type: Number, required: true },
    destinationLng: { type: Number, required: true },
    departureTime: { type: String, required: true },
    estimatedArrival: { type: String, default: '' },
    capacity: { type: Number, required: true, default: 6 },
    bookedSeats: { type: Number, required: true, default: 0, index: true },
    passengers: [
      {
        id: { type: String },
        userId: { type: String },
        studentId: { type: String, required: true },
        name: { type: String, required: true },
        pickup: { type: String, required: true },
        destination: { type: String },
        status: { type: String, enum: ['waiting', 'boarded', 'dropped'], default: 'waiting' },
        seatNo: { type: Number, required: true },
        fare: { type: Number },
        fareId: { type: String },
        bookingId: { type: String },
        gender: { type: String },
        genderPreference: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['waiting', 'boarding', 'active', 'full', 'completed', 'cancelled', 'recovery_pending', 'recovered'],
      default: 'waiting',
      index: true,
    },
    isFemaleOnly: { type: Boolean, default: false, index: true },
    genderPreference: { type: String, enum: ['ANYONE', 'FEMALE_ONLY'], default: 'ANYONE' },
    stops: [
      {
        id: { type: String, required: true },
        bookingId: { type: String },
        studentId: { type: String },
        type: { type: String, enum: ['PICKUP', 'DROPOFF'], required: true },
        name: { type: String, required: true },
        address: { type: String },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        sequence: { type: Number, required: true },
        status: {
          type: String,
          enum: ['UPCOMING', 'ARRIVING', 'ARRIVED', 'BOARDED', 'COMPLETED', 'DROPPED_OFF', 'PENDING', 'DEPARTED', 'SKIPPED'],
          default: 'UPCOMING',
        },
        estimatedArrival: { type: String },
        actualArrival: { type: Date },
      },
    ],
    tripRoute: {
      version: { type: Number, default: 1 },
      origin: { lat: Number, lng: Number, name: String },
      destination: { lat: Number, lng: Number, name: String },
      geometry: { type: [[Number]], default: [] },
      distanceMeters: { type: Number, default: 0 },
      durationSeconds: { type: Number, default: 0 },
      remainingDistanceMeters: { type: Number, default: 0 },
      remainingDurationSeconds: { type: Number, default: 0 },
      progressPercent: { type: Number, default: 0 },
      currentStopIndex: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['PLANNED', 'NAVIGATING', 'OFF_ROUTE', 'REROUTING', 'ARRIVING', 'COMPLETED'],
        default: 'PLANNED',
      },
      steps: { type: [Schema.Types.Mixed], default: [] },
    },
    fare: { type: Number, required: true, default: 25 },
    totalFareAmount: { type: Number, default: 0 },
    averageFare: { type: Number, default: 0 },
    totalSharedSavings: { type: Number, default: 0 },
    demandLevel: { type: String, enum: ['LOW', 'NORMAL', 'HIGH'], default: 'NORMAL' },
    routeCoordinates: { type: [[Number]], default: [] },
    currentLat: { type: Number, default: 17.398 },
    currentLng: { type: Number, default: 78.479 },
    startLocation: { type: String },
    startLocationLat: { type: Number },
    startLocationLng: { type: Number },
    distanceKm: { type: Number, default: 4.2 },
    distanceMeters: { type: Number },
    durationSeconds: { type: Number },
    hasDeviation: { type: Boolean, default: false, index: true },
    hasSosAlert: { type: Boolean, default: false, index: true },
    date: { type: String, default: 'today', index: true },
  },
  { timestamps: true }
)

export const RideModel = mongoose.models.Ride || mongoose.model<IRide>('Ride', RideSchema)
