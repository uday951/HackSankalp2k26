import mongoose, { Schema, Document } from 'mongoose'

export type SafetyEventType = 'ROUTE_DEVIATION' | 'SOS' | 'PANIC' | 'DRIVER_DELAY' | 'STUDENT_SOS' | 'DRIVER_SOS' | 'OTHER'

export interface ISafetyEvent extends Document {
  id: string
  rideId?: string
  userId?: string
  userName?: string
  userRole?: string
  userPhone?: string
  vehicleId?: string
  driverId?: string
  driverName?: string
  routeName?: string
  passengerCount?: number
  eventType: SafetyEventType
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  lat?: number
  lng?: number
  message: string
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'INVESTIGATING' | 'CANCELLED'
  resolved: boolean
  resolvedAt?: Date
  resolvedBy?: string
  acknowledgedAt?: Date
  acknowledgedBy?: string
  emergencyContact?: {
    name: string
    relationship: string
    phone: string
    email?: string
  }
  smsStatus?: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'
  smsMessage?: string
  callStatus?: 'INITIATED' | 'QUEUED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'NOT_CONFIGURED'
  callSid?: string
  callMessage?: string
  emailStatus?: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'
  emailMessage?: string
  createdAt: Date
  updatedAt: Date
}

const SafetyEventSchema = new Schema<ISafetyEvent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rideId: { type: String, index: true },
    userId: { type: String, index: true },
    userName: { type: String },
    userRole: { type: String, index: true },
    userPhone: { type: String },
    vehicleId: { type: String, index: true },
    driverId: { type: String, index: true },
    driverName: { type: String },
    routeName: { type: String },
    passengerCount: { type: Number, default: 0 },
    eventType: {
      type: String,
      default: 'SOS',
      index: true,
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'CRITICAL',
      index: true,
    },
    lat: { type: Number },
    lng: { type: Number },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'INVESTIGATING', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    resolved: { type: Boolean, default: false, index: true },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: String },
    emergencyContact: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
      email: { type: String },
    },
    smsStatus: { type: String, default: 'NOT_CONFIGURED' },
    smsMessage: { type: String },
    callStatus: { type: String, default: 'NOT_CONFIGURED' },
    callSid: { type: String },
    callMessage: { type: String },
    emailStatus: { type: String, default: 'NOT_CONFIGURED' },
    emailMessage: { type: String },
  },
  { timestamps: true }
)

export const SafetyEventModel =
  mongoose.models.SafetyEvent || mongoose.model<ISafetyEvent>('SafetyEvent', SafetyEventSchema)
