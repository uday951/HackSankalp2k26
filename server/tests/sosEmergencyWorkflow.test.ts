import { describe, it, expect, beforeAll } from 'vitest'
import axios from 'axios'

const API_BASE = 'http://localhost:5000/api'

describe('CampusFlow — End-to-End SOS / Emergency Alert Workflow Test Suite', () => {
  const studentId = 's1'
  const driverId = 'd1'
  let studentSosEventId = ''
  let driverSosEventId = ''

  beforeAll(async () => {
    const health = await axios.get('http://localhost:5000/health', { timeout: 3000 })
    expect(health.data?.status).toBe('healthy')
  })

  // 1. Setup Student Emergency Contact
  it('1. Student Configures Emergency Contact in Profile', async () => {
    const contactData = {
      name: 'Dr. Srinivas Rao',
      relationship: 'Parent',
      phone: '+919876543210',
      email: 'srinivas.rao@family.org',
    }

    const res = await axios.post(
      `${API_BASE}/users/${studentId}/emergency-contact`,
      contactData,
      { headers: { 'x-user-id': studentId, 'Content-Type': 'application/json' } }
    )

    expect(res.data.success).toBe(true)
    expect(res.data.data.name).toBe('Dr. Srinivas Rao')
    expect(res.data.data.phone).toBe('+919876543210')
    expect(res.data.data.email).toBe('srinivas.rao@family.org')

    // Fetch and verify
    const getRes = await axios.get(`${API_BASE}/users/${studentId}/emergency-contact`, {
      headers: { 'x-user-id': studentId },
    })
    expect(getRes.data.success).toBe(true)
    expect(getRes.data.data.name).toBe('Dr. Srinivas Rao')
    expect(getRes.data.data.email).toBe('srinivas.rao@family.org')
  })

  // 2. Setup Driver Emergency Contact
  it('2. Driver Configures Emergency Contact in Profile', async () => {
    const driverContactData = {
      name: 'Lakshmi Kumar',
      relationship: 'Spouse',
      phone: '+919123456780',
      email: 'lakshmi.kumar@family.org',
    }

    const res = await axios.post(
      `${API_BASE}/users/${driverId}/emergency-contact`,
      driverContactData,
      { headers: { 'x-user-id': driverId, 'Content-Type': 'application/json' } }
    )

    expect(res.data.success).toBe(true)
    expect(res.data.data.name).toBe('Lakshmi Kumar')
    expect(res.data.data.phone).toBe('+919123456780')
    expect(res.data.data.email).toBe('lakshmi.kumar@family.org')
  })

  // 3. Student triggers SOS -> STUDENT_SOS_TRIGGERED
  it('3. Student Triggers SOS -> Capture Telemetry, SMS Dispatch, Email Dispatch, Dispatcher Notification', async () => {
    const sosPayload = {
      userId: studentId,
      lat: 17.3616,
      lng: 78.4747,
      forceNew: true,
    }

    const res = await axios.post(`${API_BASE}/safety/sos`, sosPayload, {
      headers: { 'x-user-id': studentId, 'Content-Type': 'application/json' },
    })

    expect(res.data.success).toBe(true)
    const event = res.data.data
    expect(event).toBeDefined()
    expect(event.userId).toBe(studentId)
    expect(event.status).toBe('ACTIVE')
    expect(event.eventType).toBe('STUDENT_SOS_TRIGGERED')
    expect(event.emergencyContact).toBeDefined()
    expect(event.emergencyContact.name).toBe('Dr. Srinivas Rao')
    expect(event.emergencyContact.email).toBe('srinivas.rao@family.org')
    expect(event.smsStatus).toBeDefined()
    expect(event.emailStatus).toBeDefined()
    expect(event.lat).toBe(17.3616)
    expect(event.lng).toBe(78.4747)

    studentSosEventId = event.id || event._id

    // Verify Dispatcher Notification was generated
    const notifRes = await axios.get(`${API_BASE}/notifications?all=true`, {
      headers: { 'x-user-id': 'admin1' },
    })
    const notifs = notifRes.data?.data || []
    const sosNotif = notifs.find(
      (n: any) =>
        (n.title && n.title.includes('SOS')) ||
        (n.message && (n.message.includes('emergency') || n.message.includes('SOS')))
    )
    expect(sosNotif).toBeDefined()
    expect(sosNotif.priority).toBe('CRITICAL')
  })

  // 4. Spam Prevention Test
  it('4. Repeated SOS Click within Window Returns Active Event (Spam Prevention)', async () => {
    const duplicateRes = await axios.post(
      `${API_BASE}/safety/sos`,
      {
        userId: studentId,
        lat: 17.3616,
        lng: 78.4747,
      },
      { headers: { 'x-user-id': studentId, 'Content-Type': 'application/json' } }
    )

    expect(duplicateRes.data.success).toBe(true)
    expect(duplicateRes.data.isExistingActive).toBe(true)
    expect(duplicateRes.data.data.status).toBe('ACTIVE')
  })

  // 5. Driver triggers SOS -> DRIVER_SOS_TRIGGERED
  it('5. Driver Triggers SOS -> Distinct DRIVER_SOS_TRIGGERED event, Telemetry & Dispatch Notification', async () => {
    const driverSosPayload = {
      userId: driverId,
      lat: 17.375,
      lng: 78.49,
      forceNew: true,
    }

    const res = await axios.post(`${API_BASE}/safety/sos`, driverSosPayload, {
      headers: { 'x-user-id': driverId, 'Content-Type': 'application/json' },
    })

    expect(res.data.success).toBe(true)
    const event = res.data.data
    expect(event).toBeDefined()
    expect(event.userId).toBe(driverId)
    expect(event.userRole).toBe('DRIVER')
    expect(event.eventType).toBe('DRIVER_SOS_TRIGGERED')
    expect(event.status).toBe('ACTIVE')
    expect(event.emergencyContact).toBeDefined()
    expect(event.emergencyContact.name).toBe('Lakshmi Kumar')
    expect(event.emergencyContact.email).toBe('lakshmi.kumar@family.org')
    expect(event.emailStatus).toBeDefined()

    driverSosEventId = event.id || event._id
  })

  // 6. Faculty triggers SOS
  it('6. Faculty Triggers SOS -> Capture Telemetry, Contact Email, and Active Event', async () => {
    const facultySosPayload = {
      userId: 'f1',
      lat: 17.365,
      lng: 78.48,
      forceNew: true,
    }

    const res = await axios.post(`${API_BASE}/safety/sos`, facultySosPayload, {
      headers: { 'x-user-id': 'f1', 'Content-Type': 'application/json' },
    })

    expect(res.data.success).toBe(true)
    const event = res.data.data
    expect(event).toBeDefined()
    expect(event.userId).toBe('f1')
    expect(event.status).toBe('ACTIVE')
    expect(event.userRole).toBe('FACULTY')
    expect(event.emailStatus).toBeDefined()
  })

  // 7. Dispatcher views Safety Events
  it('7. Dispatcher Retrieves Active Safety & SOS Events Registry', async () => {
    const res = await axios.get(`${API_BASE}/safety/events`, {
      headers: { 'x-user-id': 'admin1' },
    })

    expect(res.data.success).toBe(true)
    const events = res.data.data
    expect(Array.isArray(events)).toBe(true)

    const foundStudentSos = events.find((e: any) => e.id === studentSosEventId)
    const foundDriverSos = events.find((e: any) => e.id === driverSosEventId)

    expect(foundStudentSos).toBeDefined()
    expect(foundStudentSos.eventType).toBe('STUDENT_SOS_TRIGGERED')
    expect(foundDriverSos).toBeDefined()
    expect(foundDriverSos.eventType).toBe('DRIVER_SOS_TRIGGERED')
  })

  // 7. Dispatcher Acknowledges SOS
  it('7. Dispatcher Acknowledges Active SOS (ACTIVE -> ACKNOWLEDGED)', async () => {
    expect(studentSosEventId).toBeTruthy()

    const res = await axios.post(
      `${API_BASE}/safety/events/${studentSosEventId}/acknowledge`,
      { acknowledgedBy: 'admin1' },
      { headers: { 'x-user-id': 'admin1', 'Content-Type': 'application/json' } }
    )

    expect(res.data.success).toBe(true)
    const event = res.data.data
    expect(event.status).toBe('ACKNOWLEDGED')
    expect(event.acknowledgedBy).toBe('admin1')
    expect(event.acknowledgedAt).toBeDefined()
  })

  // 8. Dispatcher Resolves SOS
  it('8. Dispatcher Resolves SOS (ACKNOWLEDGED -> RESOLVED)', async () => {
    expect(studentSosEventId).toBeTruthy()

    const res = await axios.post(
      `${API_BASE}/safety/events/${studentSosEventId}/resolve`,
      { resolvedBy: 'admin1' },
      { headers: { 'x-user-id': 'admin1', 'Content-Type': 'application/json' } }
    )

    expect(res.data.success).toBe(true)
    const event = res.data.data
    expect(event.status).toBe('RESOLVED')
    expect(event.resolved).toBe(true)
    expect(event.resolvedBy).toBe('admin1')
    expect(event.resolvedAt).toBeDefined()
  })
})
