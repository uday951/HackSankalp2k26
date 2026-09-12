/**
 * Emergency SOS Email Service
 * Responsible for sending real-time SOS emergency notification emails to saved emergency contacts.
 * Adheres strictly to security guidelines: never exposes passwords, tokens, or DB internals.
 */

export interface SendEmergencyEmailParams {
  to: string
  userName: string
  userRole: string
  tripId?: string
  vehicleInfo?: string
  driverName?: string
  locationStr?: string
  timestamp?: string
}

export interface EmailSendResult {
  sent: boolean
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED'
  message: string
}

class EmailService {
  private transporter: any = null
  private isConfigured: boolean = false
  private fromEmail: string = 'sos-alerts@campusflow.io'
  private initPromise: Promise<void> | null = null

  constructor() {
    this.initPromise = this.initTransporter()
  }

  private async initTransporter() {
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    this.fromEmail = process.env.FROM_EMAIL || process.env.SMTP_FROM || 'sos-alerts@campusflow.io'

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const nodemailer = await import('nodemailer' as any).catch(() => null)
        if (nodemailer && nodemailer.createTransport) {
          this.transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          })
          this.isConfigured = true
          console.log(`[EmailService] Configured SMTP transporter with host: ${smtpHost}`)
        } else {
          this.isConfigured = false
        }
      } catch (err: any) {
        console.warn('[EmailService] Failed to initialize SMTP transporter:', err?.message)
        this.isConfigured = false
      }
    } else {
      this.isConfigured = false
    }
  }

  /**
   * Dispatches an emergency SOS notification email to the user's registered emergency contact.
   */
  async sendEmergencySosEmail(params: SendEmergencyEmailParams): Promise<EmailSendResult> {
    if (this.initPromise) {
      await this.initPromise
    }

    const {
      to,
      userName,
      userRole,
      tripId,
      vehicleInfo,
      driverName,
      locationStr,
      timestamp,
    } = params

    if (!to || !to.includes('@')) {
      return {
        sent: false,
        status: 'NOT_CONFIGURED',
        message: 'No valid emergency contact email address provided.',
      }
    }

    const timeString = timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    const subject = 'CAMPUSFLOW — EMERGENCY SOS ALERT'
    const textBody = `An SOS emergency alert has been triggered by:

Name: ${userName || 'Commuter'}
Role: ${userRole || 'Student'}
Trip: ${tripId || 'N/A (Standalone SOS outside active trip)'}
Vehicle: ${vehicleInfo || 'N/A'}
Driver: ${driverName || 'N/A'}
Current Location: ${locationStr || 'Campus Zone'}
Time: ${timeString}

Please contact the user or CampusFlow emergency support immediately.`

    if (!this.isConfigured || !this.transporter) {
      console.log(`[EmailService] Emergency contact email target: ${to} (SMTP not configured in environment).`)
      return {
        sent: false,
        status: 'NOT_CONFIGURED',
        message: 'Emergency email could not be sent because the email service is not configured.',
      }
    }

    try {
      await this.transporter.sendMail({
        from: `"CampusFlow Emergency Dispatch" <${this.fromEmail}>`,
        to,
        subject,
        text: textBody,
      })

      console.log(`[EmailService] Emergency SOS alert email successfully delivered to ${to}`)
      return {
        sent: true,
        status: 'SENT',
        message: `Emergency alert email sent to ${to}.`,
      }
    } catch (error: any) {
      console.error(`[EmailService] Failed to send emergency email to ${to}:`, error?.message)
      return {
        sent: false,
        status: 'FAILED',
        message: error?.message || 'Failed to deliver emergency email.',
      }
    }
  }

  public isEmailConfigured(): boolean {
    return this.isConfigured
  }
}

export const emailService = new EmailService()
