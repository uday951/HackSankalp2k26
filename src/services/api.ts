import type {
  Ride,
  Booking,
  Notification,
  SafetyEvent,
  Student,
  Driver,
  Vehicle,
  EmergencyContact,
  UserStats,
  TripRoute,
  RouteStop,
  RouteStep,
  LiveTripState,
  FareEstimateResult,
  RideFare,
  PricingEvent,
  PricingConfig,
  FleetPricingMetrics,
} from '../types'


const getApiBase = () => {
  if ((import.meta as any).env?.VITE_API_BASE_URL) {
    return (import.meta as any).env.VITE_API_BASE_URL
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return '/api'
  }
  return 'http://127.0.0.1:5000/api'
}

const getWsBase = () => {
  if ((import.meta as any).env?.VITE_WS_BASE_URL) {
    return (import.meta as any).env.VITE_WS_BASE_URL
  }
  if (typeof window !== 'undefined' && window.location) {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (isDev) {
      // In local dev, connect directly to backend port 5000 to bypass Vite dev server proxy errors
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${proto}//${window.location.hostname}:5000/realtime`
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/realtime`
  }
  return 'ws://127.0.0.1:5000/realtime'
}

const API_BASE = getApiBase()
const WS_BASE = getWsBase()

class ApiClient {
  private userId: string = 's1'
  private driverId: string = 'd1'
  private token: string | null = localStorage.getItem('campusflow_token')
  private ws: WebSocket | null = null
  private listeners = new Set<(event: string, payload: any) => void>()

  setAuth(userId: string, driverId?: string, token?: string | null) {
    if (userId) {
      this.userId = userId
      localStorage.setItem('campusflow_user_id', userId)
    }
    if (driverId) {
      this.driverId = driverId
      localStorage.setItem('campusflow_driver_id', driverId)
    }
    if (token !== undefined) {
      this.token = token
      if (token) localStorage.setItem('campusflow_token', token)
      else localStorage.removeItem('campusflow_token')
    }
  }

  setToken(token: string | null) {
    this.token = token
    if (token) localStorage.setItem('campusflow_token', token)
    else localStorage.removeItem('campusflow_token')
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('campusflow_token')
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`
    const token = this.getToken()
    const isMutation = ['POST', 'PUT', 'PATCH'].includes((options.method || 'GET').toUpperCase())
    const headers: Record<string, string> = {
      ...(isMutation ? { 'Content-Type': 'application/json' } : {}),
      'x-user-id': this.userId,
      'x-driver-id': this.driverId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    }

    const reqOptions: RequestInit = {
      ...options,
      headers,
    }

    if (isMutation && reqOptions.body === undefined) {
      reqOptions.body = JSON.stringify({})
    }

    let res: Response
    try {
      res = await fetch(url, reqOptions)
    } catch (networkErr: any) {
      const error = new Error('Cannot connect to backend server. Please ensure the server is running on port 5000.') as any
      error.code = 'NETWORK_ERROR'
      error.original = networkErr
      throw error
    }

    let json: any = null
    const text = await res.text()
    if (text && text.trim().length > 0) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { error: { message: text } }
      }
    } else {
      json = {}
    }

    if (!res.ok || json.success === false) {
      if (res.status === 502 || res.status === 504 || res.status === 503) {
        throw new Error(`Backend server unavailable (HTTP ${res.status}). Please run 'npm run server' in root.`)
      }
      const messageFromDetail =
        typeof json.error === 'string'
          ? (json.message || json.error)
          : json.error?.message || json.message
      const errorMsg = messageFromDetail || (res.statusText ? `API Error: ${res.statusText}` : `API Error (${res.status})`)
      const error = new Error(errorMsg) as any
      error.code = json.error?.code || (typeof json.error === 'string' ? json.error : 'API_ERROR')
      error.status = res.status
      throw error
    }

    return json.data
  }

  // --- Multi-Portal Authentication ---
  async verifyEmailDomain(email: string): Promise<{
    isValid: boolean
    domain: string
    authorizedDomains: string[]
    message: string
  }> {
    return this.request<{
      isValid: boolean
      domain: string
      authorizedDomains: string[]
      message: string
    }>('/auth/verify-email-domain', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async verifyOcr(
    enteredName: string,
    detectedName: string
  ): Promise<{
    enteredName: string
    detectedName: string
    matchScore: number
    isMatch: boolean
    status: 'MATCHED' | 'MISMATCH'
    statusLabel: string
    confidence: number
    explanation: string
  }> {
    return this.request<any>('/auth/verify-ocr', {
      method: 'POST',
      body: JSON.stringify({ enteredName, detectedName }),
    })
  }

  async registerStudent(data: {
    fullName: string
    rollNumber: string
    collegeName: string
    collegeEmail: string
    phone?: string
    password: string
    idCardPhoto?: string
    detectedName?: string
  }): Promise<{ user: any; token: string; ocrResult: any }> {
    const res = await this.request<{ user: any; token: string; ocrResult: any }>(
      '/auth/register/student',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    if (res.token) this.setToken(res.token)
    return res
  }

  async registerFaculty(data: {
    fullName: string
    collegeId: string
    collegeName: string
    collegeEmail: string
    phone?: string
    password: string
    idCardPhoto?: string
    detectedName?: string
  }): Promise<{ user: any; token: string; ocrResult: any }> {
    const res = await this.request<{ user: any; token: string; ocrResult: any }>(
      '/auth/register/faculty',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    if (res.token) this.setToken(res.token)
    return res
  }

  async registerDriver(data: {
    fullName: string
    phone: string
    email?: string
    password: string
    vehicleRegistration: string
    vehicleType: string
    licenseNumber: string
    rcNumber?: string
    licensePhoto?: string
    rcPhoto?: string
    passportPhoto?: string
    detectedName?: string
  }): Promise<{ user: any; token: string; ocrResult: any }> {
    const res = await this.request<{ user: any; token: string; ocrResult: any }>(
      '/auth/register/driver',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    if (res.token) this.setToken(res.token)
    return res
  }

  async login(credentials: {
    email?: string
    username?: string
    phone?: string
    password?: string
    otp?: string
    code?: string
    role?: string
    userId?: string
  }): Promise<{ user: any; token: string; role: string }> {
    const res = await this.request<{ user: any; token: string; role: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    )
    if (res.token) {
      this.setToken(res.token)
      this.setAuth(res.user.id, res.role === 'DRIVER' ? res.user.id : this.driverId, res.token)
    }
    return res
  }

  // --- Twilio OTP Authentication ---
  async sendOtp(phone: string): Promise<{ success: boolean; message: string; data?: any }> {
    return this.request<{ success: boolean; message: string; data?: any }>(
      '/auth/send-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }
    )
  }

  async verifyOtp(
    phone: string,
    otp: string
  ): Promise<{ success: boolean; message: string; data?: { verified: boolean; phone: string; user?: any; token?: string; role?: string } }> {
    const res = await this.request<{ success: boolean; message: string; data?: { verified: boolean; phone: string; user?: any; token?: string; role?: string } }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ phone, otp, code: otp }),
      }
    )
    if (res?.data?.token && res?.data?.user) {
      this.setToken(res.data.token)
      this.setAuth(res.data.user.id, res.data.role === 'DRIVER' ? res.data.user.id : this.driverId, res.data.token)
    }
    return res
  }

  // --- Realtime WebSocket ---
  initWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      this.ws = new WebSocket(WS_BASE)

      this.ws.onopen = () => {
        console.log('[API] Realtime WebSocket connected to', WS_BASE)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.listeners.forEach((listener) => listener(data.type, data.payload))
        } catch (e) {
          console.warn('[API] Could not parse WS message:', e)
        }
      }

      this.ws.onclose = () => {
        console.log('[API] WS disconnected. Reconnecting in 3s...')
        setTimeout(() => this.initWebSocket(), 3000)
      }

      this.ws.onerror = (err) => {
        console.warn('[API] WS error:', err)
      }
    } catch (err) {
      console.warn('[API] Could not initialize WebSocket:', err)
    }
  }

  onRealtimeEvent(callback: (event: string, payload: any) => void) {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  // --- Auth & Users ---
  async getMe(): Promise<Student> {
    return this.request<Student>('/auth/me')
  }

  async getAllUsers(): Promise<Student[]> {
    return this.request<Student[]>('/users')
  }

  async getVehicles(): Promise<Vehicle[]> {
    return this.request<Vehicle[]>('/vehicles')
  }

  async getDrivers(): Promise<Driver[]> {
    return this.request<Driver[]>('/drivers')
  }

  async getStudents(): Promise<Student[]> {
    return this.request<Student[]>('/students')
  }


  private cleanRideName(name?: string): string {
    if (!name) return 'Campus Shuttle'
    let clean = name.replace(/\s*\[?hackathon[^\]]*\]?/gi, '').trim()
    clean = clean
      .replace(/Hostel A/g, 'Sri Indu Boys Hostel')
      .replace(/Hostel B/g, 'Sri Indu Girls Hostel')
      .replace(/Hostel C/g, 'Campus Transit Terminal')
    const arrowParts = clean.split('→').map((s) => s.trim())
    if (arrowParts.length === 2 && arrowParts[0].toLowerCase() === arrowParts[1].toLowerCase()) {
      clean = `${arrowParts[0]} → SRI INDU College`
    }
    return clean || 'Campus Shuttle'
  }

  // --- Rides ---
  async getRides(query?: { status?: string; date?: string }): Promise<Ride[]> {
    const params = new URLSearchParams()
    if (query?.status) params.set('status', query.status)
    if (query?.date) params.set('date', query.date)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const rides = await this.request<Ride[]>(`/rides${qs}`)
    return (rides || []).map((r) => ({
      ...r,
      routeName: this.cleanRideName(r.routeName),
    }))
  }

  async getRide(id: string): Promise<Ride> {
    const r = await this.request<Ride>(`/rides/${id}`)
    if (!r) return r
    return {
      ...r,
      routeName: this.cleanRideName(r.routeName),
    }
  }

  async createBooking(data: {
    studentId: string
    pickup: string
    pickupName?: string
    pickupAddress?: string
    pickupCoords?: { lat: number; lng: number }
    destination: string
    destinationName?: string
    destinationAddress?: string
    destinationCoords?: { lat: number; lng: number }
    time?: string
    seats?: number
    genderPreference?: string
  }): Promise<{
    booking: Booking
    trip: Ride
    matchingType: 'JOINED_EXISTING_TRIP' | 'NEW_TRIP' | 'QUEUED_FOR_DISPATCH'
    driver?: any
    vehicle?: any
    metrics?: any
  }> {
    return this.request<any>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCurrentTripForDriver(driverId?: string): Promise<Ride | null> {
    const query = driverId ? `?driverId=${encodeURIComponent(driverId)}` : ''
    const res = await this.request<any>(`/driver/current-trip${query}`)
    if (!res) return null
    return {
      ...res,
      routeName: this.cleanRideName(res.routeName),
    }
  }

  async getActiveTrips(): Promise<Ride[]> {
    const res = await this.request<Ride[]>('/rides/active')
    return (res || []).map((r) => ({
      ...r,
      routeName: this.cleanRideName(r.routeName),
    }))
  }

  async createRide(data: any): Promise<Ride> {
    return this.request<Ride>('/rides', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async joinRide(
    rideId: string,
    studentId: string,
    pickup: string,
    destination: string,
    seats = 1,
    pickupCoords?: { lat: number; lng: number },
    destinationCoords?: { lat: number; lng: number },
    pickupAddress?: string,
    destinationAddress?: string,
    genderPreference?: string
  ): Promise<{ booking: Booking; ride: Ride }> {
    return this.request<{ booking: Booking; ride: Ride }>(`/rides/${rideId}/join`, {
      method: 'POST',
      body: JSON.stringify({
        studentId,
        pickup,
        destination,
        seats,
        pickupName: pickup,
        pickupAddress: pickupAddress || pickup,
        pickupCoords: pickupCoords ? [pickupCoords.lat, pickupCoords.lng] : undefined,
        destinationName: destination,
        destinationAddress: destinationAddress || destination,
        destinationCoords: destinationCoords ? [destinationCoords.lat, destinationCoords.lng] : undefined,
        genderPreference,
      }),
    })
  }

  async cancelBooking(rideId: string, studentId: string): Promise<Ride> {
    return this.request<Ride>(`/rides/${rideId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    })
  }

  async startRide(
    rideId: string,
    startLocation?: { name?: string; lat: number; lng: number }
  ): Promise<Ride> {
    return this.request<Ride>(`/rides/${rideId}/start`, {
      method: 'POST',
      body: startLocation
        ? JSON.stringify({
            startLat: startLocation.lat,
            startLng: startLocation.lng,
            startLocation: startLocation.name,
          })
        : undefined,
    })
  }

  async completeRide(rideId: string): Promise<Ride> {
    return this.request<Ride>(`/rides/${rideId}/complete`, { method: 'POST' })
  }

  // --- Ride Requests (Matching Engine) ---
  async submitRideRequest(data: {
    pickup: string | { name: string; address?: string; latitude: number; longitude: number }
    destination: string | { name: string; address?: string; latitude: number; longitude: number }
    time: string
    seats?: number
    pickupLat?: number
    pickupLng?: number
    destinationLat?: number
    destinationLng?: number
    genderPreference?: 'ANYONE' | 'FEMALE_ONLY' | string
  }): Promise<{ request: any; matches: any[] }> {
    return this.request<{ request: any; matches: any[] }>('/ride-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // --- Driver ---
  async getDriverRides(): Promise<Ride[]> {
    return this.request<Ride[]>('/driver/rides')
  }

  async acceptDriverRide(rideId: string): Promise<Ride> {
    return this.request<Ride>(`/driver/rides/${rideId}/accept`, { method: 'POST' })
  }

  async updateDriverLocation(rideId: string, lat: number, lng: number): Promise<any> {
    return this.request<any>('/driver/location', {
      method: 'POST',
      body: JSON.stringify({ rideId, lat, lng }),
    })
  }

  async updatePassengerStatus(rideId: string, studentId: string, status: 'waiting' | 'boarded' | 'dropped'): Promise<Ride> {
    return this.request<Ride>('/driver/passengers', {
      method: 'POST',
      body: JSON.stringify({ rideId, studentId, status }),
    })
  }

  // --- Live Navigation & Real-Time Tracking ---
  async getLiveTrip(rideId: string): Promise<LiveTripState> {
    return this.request<LiveTripState>(`/rides/${rideId}/live`)
  }

  async getTripRoute(rideId: string): Promise<TripRoute> {
    return this.request<TripRoute>(`/rides/${rideId}/route`)
  }

  async sendDriverLocation(
    rideId: string,
    loc: { lat: number; lng: number; heading?: number; speed?: number }
  ): Promise<{
    success: boolean
    progress: any
    currentStop: RouteStop | null
    nextManeuver: RouteStep | null
  }> {
    return this.request('/driver/location', {
      method: 'POST',
      body: JSON.stringify({
        rideId,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        speed: loc.speed,
      }),
    })
  }

  async markStopArrived(rideId: string, stopId: string): Promise<any> {
    return this.request(`/driver/rides/${rideId}/stops/${stopId}/arrived`, {
      method: 'POST',
    })
  }

  async markStopBoarded(rideId: string, stopId: string): Promise<any> {
    return this.request(`/driver/rides/${rideId}/stops/${stopId}/boarded`, {
      method: 'POST',
    })
  }

  async startDriverTrip(
    rideId: string,
    startLocation?: { name?: string; lat: number; lng: number }
  ): Promise<any> {
    return this.request(`/driver/rides/${rideId}/start`, {
      method: 'POST',
      body: startLocation
        ? JSON.stringify({
            startLat: startLocation.lat,
            startLng: startLocation.lng,
            startLocation: startLocation.name,
          })
        : undefined,
    })
  }

  async completeDriverTrip(rideId: string): Promise<any> {
    return this.request(`/driver/rides/${rideId}/complete`, {
      method: 'POST',
    })
  }

  async recalculateRoute(rideId: string): Promise<TripRoute> {
    return this.request<TripRoute>(`/rides/${rideId}/recalculate-route`, {
      method: 'POST',
    })
  }

  // --- Breakdown & Automated Ride Recovery ---
  async reportDriverBreakdown(data: {
    vehicleId?: string
    location?: { lat: number; lng: number; accuracy?: number }
    reason?: string
  }): Promise<any> {
    return this.request('/driver/breakdown', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async reportVehicleBreakdown(
    vehicleId: string,
    data: {
      location?: { lat: number; lng: number }
      reason?: string
    } = {}
  ): Promise<any> {
    return this.request(`/vehicles/${vehicleId}/breakdown`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getRecoveryStatus(rideId: string): Promise<any> {
    return this.request(`/rides/${rideId}/recovery-status`)
  }

  async getRecoveryCandidates(rideId: string): Promise<any> {
    return this.request(`/recovery/candidates/${rideId}`)
  }

  async retryRecovery(recoveryId: string, replacementVehicleId?: string): Promise<any> {
    return this.request(`/recovery/${recoveryId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ replacementVehicleId }),
    })
  }

  async getRecoveryHistory(): Promise<any> {
    return this.request('/recovery/history')
  }

  // --- Dispatcher ---
  async getDispatcherDashboard(): Promise<{
    kpis: any
    alerts: SafetyEvent[]
    activeRides: Ride[]
    vehicles: Vehicle[]
    drivers: Driver[]
    pendingRequests: Booking[]
    auditLogs: any[]
  }> {
    return this.request<any>('/dispatcher/dashboard')
  }

  async getDispatcherRides(): Promise<Ride[]> {
    return this.request<Ride[]>('/dispatcher/rides')
  }

  async getDispatcherRideDetail(id: string): Promise<{ ride: Ride; driver: Driver; vehicle: Vehicle; bookings: Booking[] }> {
    return this.request<any>(`/dispatcher/rides/${id}`)
  }

  async getDispatcherVehicles(): Promise<Vehicle[]> {
    return this.request<Vehicle[]>('/dispatcher/vehicles')
  }

  async getDispatcherDrivers(): Promise<Driver[]> {
    return this.request<Driver[]>('/dispatcher/drivers')
  }

  async getDispatcherAlerts(): Promise<SafetyEvent[]> {
    return this.request<SafetyEvent[]>('/dispatcher/alerts')
  }

  async getDispatcherPendingRequests(): Promise<Booking[]> {
    return this.request<Booking[]>('/dispatcher/requests')
  }

  async getAnalytics(): Promise<{
    totalRequests: number
    sharedRides: number
    vehiclesUsed: number
    vehicleReduction: number
    avgOccupancy: number
    estimatedSavings: number
    totalStudents: number
    demandByHour: { time: string; requests: number }[]
    topPickupZones: { zone: string; count: number; pct: number }[]
    occupancyTrend: { day: string; pct: number }[]
  }> {
    return this.request<any>('/dispatcher/analytics')
  }

  async reassignDriver(rideId: string, driverId: string): Promise<{ ride: Ride; auditLog: any }> {
    return this.request<any>(`/dispatcher/rides/${rideId}/reassign-driver`, {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    })
  }

  async reassignVehicle(rideId: string, vehicleId: string): Promise<{ ride: Ride; auditLog: any }> {
    return this.request<any>(`/dispatcher/rides/${rideId}/reassign-vehicle`, {
      method: 'POST',
      body: JSON.stringify({ vehicleId }),
    })
  }

  async cancelRideByDispatcher(rideId: string, reason?: string): Promise<{ ride: Ride; auditLog: any }> {
    return this.request<any>(`/dispatcher/rides/${rideId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async recalculateRideRoute(rideId: string): Promise<{ ride: Ride; auditLog: any }> {
    return this.request<any>(`/dispatcher/rides/${rideId}/recalculate-route`, {
      method: 'POST',
    })
  }

  async getDispatcherAuditLog(): Promise<any[]> {
    return this.request<any[]>('/dispatcher/audit-log')
  }

  async resetScheduledFleet(): Promise<{ modifiedCount: number; rides: Ride[] }> {
    return this.request<any>('/dispatcher/fleet/reset-schedule', {
      method: 'POST',
    })
  }

  // --- Safety ---
  async triggerDeviation(rideId: string): Promise<any> {
    return this.request<any>('/safety/route-deviation', {
      method: 'POST',
      body: JSON.stringify({ rideId }),
    })
  }

  // --- Notifications ---
  async getNotifications(): Promise<Notification[]> {
    return this.request<Notification[]>('/notifications')
  }

  async markNotificationRead(notifId: string): Promise<Notification> {
    return this.request<Notification>(`/notifications/${notifId}/read`, { method: 'POST' })
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request<void>('/notifications/read-all', { method: 'POST' })
  }

  // --- Ride Messaging (persisted via Notification model) ---
  async sendRideMessage(data: {
    rideId: string
    bookingId?: string
    senderId: string
    senderName?: string
    senderRole: 'student' | 'driver'
    receiverId?: string
    studentId?: string
    driverId?: string
    text: string
  }): Promise<any> {
    return this.request<any>('/notifications/message', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getRideMessages(rideId: string): Promise<any[]> {
    return this.request<any[]>(`/notifications/messages/${rideId}`)
  }

  async markRideMessagesRead(rideId: string): Promise<void> {
    return this.request<void>(`/notifications/messages/${rideId}/read`, { method: 'POST' })
  }

  // --- Bookings ---
  async getUserBookings(studentId: string): Promise<Booking[]> {
    return this.request<Booking[]>(`/rides/bookings/user/${studentId}`)
  }

  async getAllBookings(): Promise<Booking[]> {
    return this.request<Booking[]>('/rides/bookings')
  }

  async getRideBookings(rideId: string): Promise<any[]> {
    return this.request<any[]>(`/rides/bookings?rideId=${rideId}`)
  }

  async getRidePassengers(rideId: string): Promise<any[]> {
    return this.request<any[]>(`/rides/${rideId}/passengers`)
  }

  // --- Emergency Contact ---
  async getEmergencyContact(userId: string): Promise<EmergencyContact | null> {
    return this.request<EmergencyContact | null>(`/users/${userId}/emergency-contact`)
  }

  async saveEmergencyContact(
    userId: string,
    data: { name: string; relationship: string; phone: string }
  ): Promise<EmergencyContact> {
    return this.request<EmergencyContact>(`/users/${userId}/emergency-contact`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteEmergencyContact(userId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/users/${userId}/emergency-contact`, {
      method: 'DELETE',
    })
  }

  // --- Stats ---
  async getUserStats(userId: string): Promise<UserStats> {
    return this.request<UserStats>(`/users/${userId}/stats`)
  }

  // --- Ratings ---
  async rateRide(
    rideId: string,
    data: { rating: number; comment?: string; bookingId?: string; toUserId?: string }
  ): Promise<any> {
    return this.request<any>(`/rides/${rideId}/rate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // --- Demo Controls ---
  async demoFillSeat(rideId = 'ride-102'): Promise<Ride> {
    return this.request<Ride>('/demo/fill-seat', {
      method: 'POST',
      body: JSON.stringify({ rideId }),
    })
  }

  async demoCancelPassenger(rideId = 'ride-102'): Promise<Ride> {
    return this.request<Ride>('/demo/cancel-passenger', {
      method: 'POST',
      body: JSON.stringify({ rideId }),
    })
  }

  async demoAddStudent(): Promise<Notification> {
    return this.request<Notification>('/demo/add-student', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async demoTriggerDeviation(rideId = 'ride-105'): Promise<any> {
    return this.request<any>('/demo/trigger-deviation', {
      method: 'POST',
      body: JSON.stringify({ rideId }),
    })
  }

  async demoTriggerSOS(rideId = 'ride-102', userId = 's1'): Promise<SafetyEvent> {
    return this.request<SafetyEvent>('/demo/trigger-sos', {
      method: 'POST',
      body: JSON.stringify({ rideId, userId }),
    })
  }

  async demoTraffic(): Promise<{ trafficActive: boolean }> {
    return this.request<{ trafficActive: boolean }>('/demo/traffic', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async demoReset(): Promise<void> {
    return this.request<void>('/demo/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  // --- AI Optimization & Transportation Intelligence ---

  async getOptimizationStatus(): Promise<{
    success: boolean
    python_service_online: boolean
    engine: string
    timestamp: string
  }> {
    return this.request('/optimization/status')
  }

  async getNetworkOptimizationPreview(): Promise<{
    success: boolean
    data: {
      assignments: any[]
      unassigned_request_ids: string[]
      metrics: {
        vehicle_reduction_pct: number
        fleet_occupancy_pct: number
        total_km_saved: number
        vehicles_deployed: number
        riders_served: number
        solver_status: string
        solve_time_ms: number
      }
      input_summary: {
        total_pending_requests: number
        fleet_vehicles_available: number
      }
    }
  }> {
    return this.request('/optimization/network-preview')
  }

  async applyNetworkOptimization(assignments: any[], dispatcherId?: string): Promise<{
    success: boolean
    message: string
    created_ride_ids: string[]
  }> {
    return this.request('/optimization/apply-network', {
      method: 'POST',
      body: JSON.stringify({ assignments, dispatcher_id: dispatcherId }),
    })
  }

  async getDemandForecast(zone = 'Main Campus Gate'): Promise<{
    success: boolean
    zone: string
    current: {
      hour: number
      label: string
      predicted_demand: number
      surge_multiplier: number
      is_peak_hour: boolean
      recommended_vehicles: number
    }
    forecast_curve: Array<{
      hour: number
      label: string
      predicted_demand: number
      surge_multiplier: number
      is_peak_hour: boolean
      recommended_vehicles: number
    }>
    timestamp: string
  }> {
    return this.request(`/optimization/demand-forecast?zone=${encodeURIComponent(zone)}`)
  }

  async getOptimizationBenchmark(): Promise<any> {
    return this.request('/optimization/benchmark')
  }

  // ==========================================
  // Dynamic Shared-Ride Pricing APIs
  // ==========================================

  async getFareEstimate(params: {
    pickupName: string
    pickupLat: number
    pickupLng: number
    destinationName: string
    destinationLat: number
    destinationLng: number
    seats?: number
    rideId?: string
  }): Promise<FareEstimateResult & { success: boolean; data: FareEstimateResult }> {
    const res: any = await this.request('/pricing/estimate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    const payload = (res?.data || res) as FareEstimateResult
    return Object.assign(payload, { success: true, data: payload })
  }

  async calculateFare(params: {
    studentId?: string
    pickupName: string
    pickupLat: number
    pickupLng: number
    destinationName: string
    destinationLat: number
    destinationLng: number
    seats?: number
    rideId: string
  }): Promise<{ success: boolean; data: any }> {
    const res: any = await this.request('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    const payload = res?.data || res
    return Object.assign(payload, { success: true, data: payload })
  }

  async recalculateFare(params: {
    bookingId: string
    reason?: string
    forceAdjustAmount?: number
  }): Promise<{ success: boolean; data: any }> {
    const res: any = await this.request('/pricing/recalculate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    const payload = res?.data || res
    return Object.assign(payload, { success: true, data: payload })
  }

  async getBookingFare(bookingId: string): Promise<any> {
    const res: any = await this.request(`/pricing/booking/${bookingId}`)
    const payload = res?.data || res
    return Object.assign(payload, { success: true, data: payload })
  }

  async getRideFares(rideId: string): Promise<any> {
    const res: any = await this.request(`/pricing/ride/${rideId}`)
    const payload = res?.data || res
    return Object.assign(payload, { success: true, data: payload })
  }

  async getRidePricingEvents(rideId: string): Promise<{ success: boolean; data: PricingEvent[] }> {
    return this.request(`/pricing/ride/${rideId}/events`)
  }

  async getPricingConfig(): Promise<{ success: boolean; data: PricingConfig }> {
    return this.request('/pricing/config')
  }

  async updatePricingConfig(config: Partial<PricingConfig>): Promise<{ success: boolean; data: PricingConfig }> {
    return this.request('/pricing/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    })
  }

  async getFleetPricingMetrics(): Promise<{ success: boolean; data: FleetPricingMetrics }> {
    return this.request('/pricing/fleet-metrics')
  }

  // --- Safety & Emergency SOS ---
  async triggerSOS(params: {
    rideId?: string
    userId?: string
    lat?: number
    lng?: number
    emergencyPhone?: string
    emergencyName?: string
  }): Promise<any> {
    return this.request('/safety/sos', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async acknowledgeSafetyEvent(eventId: string): Promise<any> {
    return this.request(`/safety/events/${eventId}/acknowledge`, {
      method: 'POST',
    })
  }

  async resolveSafetyEvent(eventId: string): Promise<any> {
    return this.request(`/safety/events/${eventId}/resolve`, {
      method: 'POST',
    })
  }

  async getSafetyEvents(params?: { resolved?: boolean; status?: string; rideId?: string }): Promise<any[]> {
    const searchParams = new URLSearchParams()
    if (params?.resolved !== undefined) searchParams.set('resolved', String(params.resolved))
    if (params?.status) searchParams.set('status', params.status)
    if (params?.rideId) searchParams.set('rideId', params.rideId)
    const queryString = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return this.request(`/safety/events${queryString}`)
  }
}

export const api = new ApiClient()

