import mongoose, { Schema, Document } from 'mongoose'

export interface IEmergencyContact extends Document {
  id: string
  userId: string
  name: string
  relationship: string
  phone: string
  email?: string
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

const EmergencyContactSchema = new Schema<IEmergencyContact>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    relationship: { type: String, required: true, default: 'Parent' },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    isPrimary: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const EmergencyContactModel =
  mongoose.models.EmergencyContact ||
  mongoose.model<IEmergencyContact>('EmergencyContact', EmergencyContactSchema)
