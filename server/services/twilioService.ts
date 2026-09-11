import type twilio from 'twilio'
import { ENV } from '../config/env.js'
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phone.js'

export interface SendSmsResult {
  success: boolean
  messageId?: string
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'
  provider: 'TWILIO' | 'DEV_SIMULATION'
  recipient: string
  error?: string
}

export interface SendOtpResult {
  success: boolean
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEV_SIMULATED'
  message: string
  phone: string
  expiresInSeconds?: number
  devOtp?: string
  error?: string
}

export interface VerifyOtpResult {
  success: boolean
  message: string
  phone: string
  error?: string
}

export interface SosAlertPayload {
  recipientPhone: string
  recipientName?: string
  senderName: string
  senderRole: 'STUDENT' | 'FACULTY' | 'DRIVER' | string
  rideId?: string
  routeName?: string
  lat?: number
  lng?: number
  vehiclePlate?: string
  emergencyDetails?: string
}

export interface SendCallResult {
  success: boolean
  callSid?: string
  status: 'INITIATED' | 'QUEUED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'NOT_CONFIGURED'
  provider: 'TWILIO' | 'DEV_SIMULATION'
  recipient: string
  error?: string
  message?: string
}

interface LocalOtpEntry {
  code: string
  expiresAt: number
  attempts: number
  lastSentAt: number
}

export class TwilioService {
  private client: twilio.Twilio | null = null
  private isConfigured: boolean = false
  private verifyServiceSid: string = ''
  private fromNumber: string = ''
  private localOtpStore = new Map<string, LocalOtpEntry>()
  private initPromise: Promise<void> | null = null

  constructor() {
    this.initPromise = this.initClient()
  }

  /** Centralized Twilio initialization */
  public async initClient(): Promise<void> {
    const accountSid = ENV.TWILIO_ACCOUNT_SID?.trim()
    const authToken = ENV.TWILIO_AUTH_TOKEN?.trim()
    this.fromNumber = ENV.TWILIO_PHONE_NUMBER?.trim()
    this.verifyServiceSid = ENV.TWILIO_VERIFY_SERVICE_SID?.trim()

    if (accountSid && authToken && (this.fromNumber || this.verifyServiceSid)) {
      try {
        const twilioLib = await import('twilio').then((m) => m.default || m).catch(() => null)
        if (twilioLib) {
          this.client = twilioLib(accountSid, authToken)
          this.isConfigured = true
          const maskedSid = accountSid.length > 8 ? accountSid.slice(0, 4) + '...' + accountSid.slice(-4) : 'Configured'
          console.log('[TwilioService] Initialized official Twilio client with Account SID: ' + maskedSid)
        } else {
          this.isConfigured = false
          this.client = null
          console.log('[TwilioService] Twilio package not available on disk. Running in DEV simulation mode.')
        }
      } catch (err: any) {
        this.isConfigured = false
        this.client = null
        console.warn('[TwilioService] Initialization error:', err.message)
      }
    } else {
      this.isConfigured = false
      this.client = null
      console.log('[TwilioService] Real Twilio credentials not fully set in .env. Running in DEV mode (OTP & SMS logged safely to console).')
    }
  }

  private async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  public async getStatus() {
    await this.ensureInitialized()
    return {
      configured: this.isConfigured,
      hasVerifyService: Boolean(this.verifyServiceSid),
      hasPhoneNumber: Boolean(this.fromNumber),
      fallbackSosNumber: ENV.SOS_ALERT_PHONE_NUMBER || null,
    }
  }

  /** Universal Send SMS */
  async sendSMS(to: string, messageText: string): Promise<SendSmsResult> {
    await this.ensureInitialized()
    const normalizedTo = normalizePhoneNumber(to)
    if (!normalizedTo || !isValidPhoneNumber(normalizedTo)) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.isConfigured ? 'TWILIO' : 'DEV_SIMULATION',
        recipient: to,
        error: 'Invalid recipient phone number format.',
      }
    }

    if (this.isConfigured && this.client && this.fromNumber) {
      try {
        const msg = await this.client.messages.create({
          body: messageText,
          from: this.fromNumber,
          to: normalizedTo,
        })
        return {
          success: true,
          messageId: msg.sid,
          status: 'SENT',
          provider: 'TWILIO',
          recipient: normalizedTo,
        }
      } catch (err: any) {
        console.error('[TwilioService] sendSMS error:', err.message)
        return {
          success: false,
          status: 'FAILED',
          provider: 'TWILIO',
          recipient: normalizedTo,
          error: err.message,
        }
      }
    }

    // Safe local simulation logger (DEV mode)
    console.log('\n==================================================')
    console.log('[TWILIO SMS DISPATCH - DEV SIMULATION] To: ' + normalizedTo)
    console.log('--------------------------------------------------')
    console.log(messageText)
    console.log('==================================================\n')

    return {
      success: true,
      status: 'NOT_CONFIGURED',
      provider: 'DEV_SIMULATION',
      recipient: normalizedTo,
    }
  }

  /** Universal Send OTP (Twilio Verify or standard SMS OTP) */
  async sendOTP(phone: string): Promise<SendOtpResult> {
    await this.ensureInitialized()
    const normalized = normalizePhoneNumber(phone)
    if (!normalized || !isValidPhoneNumber(normalized)) {
      return {
        success: false,
        status: 'FAILED',
        phone,
        message: 'Please provide a valid phone number (e.g. +91 9876543210).',
        error: 'INVALID_PHONE',
      }
    }

    // Rate limiting / Resend protection (45s cooldown)
    const existing = this.localOtpStore.get(normalized)
    const now = Date.now()
    if (existing && now - existing.lastSentAt < 45000) {
      const remainingSecs = Math.ceil((45000 - (now - existing.lastSentAt)) / 1000)
      return {
        success: false,
        status: 'FAILED',
        phone: normalized,
        message: 'Please wait ' + remainingSecs + 's before requesting a new OTP.',
        error: 'RATE_LIMITED',
      }
    }

    // 1. Prefer Twilio Verify if TWILIO_VERIFY_SERVICE_SID is configured
    if (this.isConfigured && this.client && this.verifyServiceSid) {
      try {
        await this.client.verify.v2
          .services(this.verifyServiceSid)
          .verifications.create({ to: normalized, channel: 'sms' })

        this.localOtpStore.set(normalized, {
          code: 'TWILIO_VERIFY',
          expiresAt: now + 10 * 60 * 1000,
          attempts: 0,
          lastSentAt: now,
        })

        return {
          success: true,
          status: 'SENT',
          phone: normalized,
          message: 'OTP sent successfully via Twilio Verify.',
          expiresInSeconds: 600,
        }
      } catch (err: any) {
        console.error('[TwilioService] Twilio Verify send error:', err.message)
      }
    }

    // 2. Fallback: Generate secure 6-digit numeric OTP and send via Twilio SMS
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()
    const otpMessage = 'Your CampusFlow verification code is ' + otpCode + '. Valid for 10 minutes. Do not share this OTP with anyone.'

    this.localOtpStore.set(normalized, {
      code: otpCode,
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0,
      lastSentAt: now,
    })

    if (this.isConfigured && this.client && this.fromNumber) {
      try {
        await this.client.messages.create({
          body: otpMessage,
          from: this.fromNumber,
          to: normalized,
        })
        return {
          success: true,
          status: 'SENT',
          phone: normalized,
          message: 'OTP sent successfully to your phone via SMS.',
          expiresInSeconds: 600,
        }
      } catch (err: any) {
        console.error('[TwilioService] Twilio SMS OTP send error:', err.message)
      }
    }

    // 3. In dev / demo mode when credentials are not yet configured:
    console.log('\n==================================================')
    console.log('[TWILIO OTP - DEV SIMULATION] Code for ' + normalized + ': ' + otpCode)
    console.log('==================================================\n')

    return {
      success: true,
      status: 'DEV_SIMULATED',
      phone: normalized,
      message: 'OTP generated successfully.',
      expiresInSeconds: 600,
      devOtp: ENV.NODE_ENV !== 'production' ? otpCode : undefined,
    }
  }

  /** Universal Verify OTP */
  async verifyOTP(phone: string, code: string): Promise<VerifyOtpResult> {
    await this.ensureInitialized()
    const normalized = normalizePhoneNumber(phone)
    const trimmedCode = (code || '').trim()

    if (!normalized || !trimmedCode) {
      return {
        success: false,
        phone: normalized || phone,
        message: 'Phone number and OTP code are required.',
        error: 'MISSING_FIELDS',
      }
    }

    // Universal master demo bypass code for hackathon testing convenience
    if (trimmedCode === '2026' || trimmedCode === '202600') {
      this.localOtpStore.delete(normalized)
      return {
        success: true,
        phone: normalized,
        message: 'OTP verified successfully.',
      }
    }

    // 1. Verify via Twilio Verify if active
    const entry = this.localOtpStore.get(normalized)
    if (this.isConfigured && this.client && this.verifyServiceSid && entry?.code === 'TWILIO_VERIFY') {
      try {
        const check = await this.client.verify.v2
          .services(this.verifyServiceSid)
          .verificationChecks.create({ to: normalized, code: trimmedCode })

        if (check.status === 'approved') {
          this.localOtpStore.delete(normalized)
          return {
            success: true,
            phone: normalized,
            message: 'OTP verified successfully.',
          }
        }
        return {
          success: false,
          phone: normalized,
          message: 'Invalid or expired verification code. Please check and try again.',
          error: 'INVALID_OTP',
        }
      } catch (err: any) {
        console.error('[TwilioService] Twilio Verify check error:', err.message)
      }
    }

    // 2. Verify via local stored OTP
    if (!entry) {
      return {
        success: false,
        phone: normalized,
        message: 'No active OTP request found for this number or OTP has expired. Please request a new code.',
        error: 'EXPIRED_OR_NOT_FOUND',
      }
    }

    if (Date.now() > entry.expiresAt) {
      this.localOtpStore.delete(normalized)
      return {
        success: false,
        phone: normalized,
        message: 'OTP code has expired. Please request a new code.',
        error: 'EXPIRED_OTP',
      }
    }

    entry.attempts += 1
    if (entry.attempts > 5) {
      this.localOtpStore.delete(normalized)
      return {
        success: false,
        phone: normalized,
        message: 'Too many incorrect attempts. Please request a new OTP code.',
        error: 'TOO_MANY_ATTEMPTS',
      }
    }

    if (entry.code === trimmedCode) {
      this.localOtpStore.delete(normalized)
      return {
        success: true,
        phone: normalized,
        message: 'OTP verified successfully.',
      }
    }

    return {
      success: false,
      phone: normalized,
      message: 'Incorrect verification code. Please check and try again.',
      error: 'INVALID_CODE',
    }
  }

  /** Universal SOS Emergency Alert SMS Dispatch */
  async sendSOSAlert(payload: SosAlertPayload): Promise<SendSmsResult> {
    const targetPhone = payload.recipientPhone?.trim() || ENV.SOS_ALERT_PHONE_NUMBER?.trim()

    if (!targetPhone) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.isConfigured ? 'TWILIO' : 'DEV_SIMULATION',
        recipient: '',
        error: 'No emergency contact phone or SOS_ALERT_PHONE_NUMBER configured in .env',
      }
    }

    const normalizedTo = normalizePhoneNumber(targetPhone)
    const tripStr = payload.routeName ? ('Ride: ' + payload.routeName) : (payload.rideId ? ('Ride: #' + payload.rideId) : 'Location: Campus Area')
    const locationUrl = (payload.lat && payload.lng) ? ('https://www.google.com/maps?q=' + payload.lat.toFixed(5) + ',' + payload.lng.toFixed(5)) : 'Location coordinates unavailable'
    const vehicleStr = payload.vehiclePlate ? ('Vehicle: ' + payload.vehiclePlate + '\n') : ''

    const smsBody = [
      '🚨 CAMPUS MOBILITY SOS ALERT',
      '',
      'Emergency distress alert triggered by ' + payload.senderName + ' (' + payload.senderRole.toUpperCase() + ').',
      tripStr,
      vehicleStr,
      'Emergency location:',
      locationUrl,
      '',
      'Please contact the student and campus security immediately.',
    ].filter(Boolean).join('\n')

    return this.sendSMS(normalizedTo, smsBody)
  }

  /** Universal SOS Emergency Voice Call Dispatch via Twilio */
  async makeEmergencyCall(payload: SosAlertPayload): Promise<SendCallResult> {
    await this.ensureInitialized()
    const targetPhone = payload.recipientPhone?.trim() || ENV.SOS_ALERT_PHONE_NUMBER?.trim()

    if (!targetPhone) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        provider: this.isConfigured ? 'TWILIO' : 'DEV_SIMULATION',
        recipient: '',
        error: 'No emergency contact phone or SOS_ALERT_PHONE_NUMBER configured in .env',
      }
    }

    const normalizedTo = normalizePhoneNumber(targetPhone)
    const normalizedFrom = this.fromNumber ? normalizePhoneNumber(this.fromNumber) : ''

    // Prevent Twilio error: Cannot call from and to the same number
    if (normalizedFrom && normalizedTo === normalizedFrom) {
      console.warn('[TwilioService] Recipient phone matches Twilio caller ID. Voice call self-dialing skipped.')
      return {
        success: false,
        status: 'FAILED',
        provider: 'TWILIO',
        recipient: normalizedTo,
        error: 'Emergency contact phone number matches Twilio sender phone number.',
      }
    }

    const sender = payload.senderName || 'A campus commuter'
    const role = (payload.senderRole || 'student').toUpperCase()
    const trip = payload.routeName || (payload.rideId ? `Ride #${payload.rideId}` : 'the campus vicinity')
    const latStr = payload.lat ? payload.lat.toFixed(4) : ''
    const lngStr = payload.lng ? payload.lng.toFixed(4) : ''
    const locationSpoken = latStr && lngStr ? `at latitude ${latStr}, longitude ${lngStr}` : 'within the campus area'

    const twiml = `<Response>
  <Say voice="alice" language="en-IN">
    Attention. Emergency Alert from Campus Mobility.
    ${sender}, a registered ${role}, has activated an emergency S O S distress alert while on ${trip}, ${locationSpoken}.
    Immediate assistance has been requested.
    An S M S with live GPS coordinates and Google Maps link has been dispatched to your phone.
    Please check your messages and contact ${sender} or campus security immediately.
  </Say>
  <Pause length="2"/>
  <Say voice="alice" language="en-IN">
    Repeating: Emergency S O S alert from ${sender}. Please check your phone immediately.
  </Say>
</Response>`

    if (this.isConfigured && this.client && this.fromNumber) {
      try {
        const call = await this.client.calls.create({
          twiml,
          to: normalizedTo,
          from: this.fromNumber,
        })
        console.log(`[TwilioService] Emergency Voice Call initiated to ${normalizedTo} (Call SID: ${call.sid}, Status: ${call.status})`)
        return {
          success: true,
          callSid: call.sid,
          status: 'INITIATED',
          provider: 'TWILIO',
          recipient: normalizedTo,
          message: `Twilio automated emergency call initiated (SID: ${call.sid})`,
        }
      } catch (err: any) {
        console.error('[TwilioService] makeEmergencyCall error:', err.message)
        return {
          success: false,
          status: 'FAILED',
          provider: 'TWILIO',
          recipient: normalizedTo,
          error: err.message,
        }
      }
    }

    // Dev Simulation
    console.log('\n==================================================')
    console.log(`[TWILIO VOICE CALL DISPATCH - DEV SIMULATION] To: ${normalizedTo}`)
    console.log('--------------------------------------------------')
    console.log(`Simulating Emergency Voice Call alert for ${sender} (${role}) to ${normalizedTo}...`)
    console.log('==================================================\n')

    return {
      success: true,
      status: 'NOT_CONFIGURED',
      provider: 'DEV_SIMULATION',
      recipient: normalizedTo,
      message: 'Dev simulated emergency phone call dispatched to ' + normalizedTo,
    }
  }
}

export const twilioService = new TwilioService()