import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fuzzyMatchId, fuzzyMatchName, preprocessImage, extractLicenseFields,
} from '../../lib/ocrUtils'
import {
  Navigation, Car, User, Phone, Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight,
  ShieldCheck, Upload, FileText, CheckCircle2, AlertTriangle, RefreshCw,
  GraduationCap, Calendar, MapPin, Hash, Building
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { compressImage } from '../../lib/utils'

export default function DriverAuth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'

  const login = useAppStore((s) => s.login)
  const registerDriver = useAppStore((s) => s.registerDriver)
  const drivers = useAppStore((s) => s.drivers)
  const currentUser = useAppStore((s) => s.currentUser)
  const currentStudent = useAppStore((s) => s.currentStudent())

  // Driver portal type: 'regular' | 'student'
  const [driverType, setDriverType] = useState<'regular' | 'student'>('regular')

  // Auth Mode: 'signin' | 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)

  // Multi-step Registration Wizard
  const [step, setStep] = useState<number>(1)

  // Registration Fields
  const [fullName, setFullName] = useState('')
  const [collegeName, setCollegeName] = useState('Sri Indu College of Eng & Tech')
  const [phone, setPhone] = useState('+91 ')
  const [email, setEmail] = useState('')
  const [vehicleReg, setVehicleReg] = useState('')
  const [vehicleType, setVehicleType] = useState('Mini Van')
  const [vehicleCapacity, setVehicleCapacity] = useState('6')
  const [vehicleTypeCustom, setVehicleTypeCustom] = useState(false)
  const [vehicleCapacityCustom, setVehicleCapacityCustom] = useState(false)
  const [licenseNo, setLicenseNo] = useState('')
  const [rcNo, setRcNo] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Documents & OCR
  const [licensePhoto, setLicensePhoto] = useState<string | null>(null)
  const [rcPhoto, setRcPhoto] = useState<string | null>(null)
  const [passportPhoto, setPassportPhoto] = useState<string | null>(null)
  const [detectedName, setDetectedName] = useState('')
  const [detectedLicense, setDetectedLicense] = useState('')
  const [ocrResult, setOcrResult] = useState<{
    matchScore: number
    isMatch: boolean
    nameOk: boolean
    dlOk: boolean
    status: 'MATCHED' | 'MISMATCH'
    statusLabel: string
    explanation: string
  } | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  // Sign In Fields
  const [signInCredential, setSignInCredential] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Student-as-Driver specific fields
  const [sdStep, setSdStep] = useState<number>(1)
  const [sdSignInEmail, setSdSignInEmail] = useState('')
  const [sdSignInPassword, setSdSignInPassword] = useState('')
  const [sdVerified, setSdVerified] = useState(false)
  const [sdVehicleType, setSdVehicleType] = useState('Car')
  const [sdVehicleReg, setSdVehicleReg] = useState('')
  const [sdVehicleCapacity, setSdVehicleCapacity] = useState('4')
  const [sdLicenseNo, setSdLicenseNo] = useState('')
  const [sdAvailableDays, setSdAvailableDays] = useState<string[]>([])
  const [sdAvailableTime, setSdAvailableTime] = useState('')
  const [sdPreferredRoute, setSdPreferredRoute] = useState('')
  const [sdLoading, setSdLoading] = useState(false)

  // Handle driving license input - exact 15 characters (2 state letters + 13 digits: SS00 YYYY 0000000)
  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
    let formatted = ''
    if (raw.length <= 4) {
      formatted = raw
    } else if (raw.length <= 8) {
      formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`
    } else {
      formatted = `${raw.slice(0, 4)} ${raw.slice(4, 8)} ${raw.slice(8, 15)}`
    }
    setLicenseNo(formatted)
    setOcrResult(null)
  }

  // License File Upload — runs real Tesseract OCR via shared util
  const handleLicenseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const rawUri = reader.result as string
      let imageUri = rawUri
      try { imageUri = await compressImage(rawUri, 1000, 1000, 0.75) } catch { /* use raw */ }
      setLicensePhoto(imageUri)
      runLicenseOcr(imageUri)
    }
    reader.readAsDataURL(file)
  }

  const runLicenseOcr = async (imageUri: string) => {
    setIsScanning(true)
    try {
      const processed = await preprocessImage(imageUri)
      const { name: extracted, dlNumber } = await extractLicenseFields(processed, imageUri)

      setDetectedName(extracted)
      setDetectedLicense(dlNumber)

      const nameOk = Boolean(extracted && fullName && fuzzyMatchName(fullName, extracted))
      const dlOk = Boolean(dlNumber && licenseNo && fuzzyMatchId(licenseNo, dlNumber))
      const isMatch = nameOk && dlOk

      setOcrResult({
        matchScore: (nameOk ? 50 : 0) + (dlOk ? 50 : 0),
        isMatch,
        nameOk,
        dlOk,
        status: isMatch ? 'MATCHED' : 'MISMATCH',
        statusLabel: isMatch ? '✓ Verified' : '✗ Verification Mismatch',
        explanation: `Name: ${nameOk ? 'Match' : 'Mismatch'}, DL No: ${dlOk ? 'Match' : 'Mismatch'}`,
      })
    } catch {
      setDetectedName('')
      setDetectedLicense('')
      setOcrResult({
        matchScore: 0, isMatch: false, nameOk: false, dlOk: false, status: 'MISMATCH',
        statusLabel: '⚠️ Could not read license — please upload a clearer photo',
        explanation: 'OCR could not extract text from the uploaded image.'
      })
      toast.error('Unable to read ID card. Please upload a clearer image.')
    } finally {
      setIsScanning(false)
    }
  }

  // Register Driver
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName || !phone || !vehicleReg || !password) {
      toast.error('Please complete all required fields.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      toast.error('Password must be 8+ chars with uppercase, lowercase, number and symbol.')
      return
    }

    setLoading(true)
    try {
      await registerDriver({
        fullName,
        collegeName: 'Campus Transport',
        phone,
        email,
        password,
        vehicleRegistration: vehicleReg,
        vehicleType,
        vehicleCapacity: Number(vehicleCapacity) || 6,
        licenseNumber: licenseNo || 'TS09 2024 0087654',
        rcNumber: rcNo,
        licensePhoto: licensePhoto || undefined,
        rcPhoto: rcPhoto || undefined,
        passportPhoto: passportPhoto || undefined,
        detectedName: detectedName || fullName,
      })
      toast.success('Driver registered successfully! License & Vehicle Verified.', { duration: 5000 })
      navigate('/driver/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Driver registration failed.')
    } finally {
      setLoading(false)
    }
  }

  // Sign In Driver
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    const credential = signInCredential.trim()
    if (!credential) {
      toast.error('Please enter your registered email or mobile number.')
      return
    }
    if (!signInPassword) {
      toast.error('Please enter your password.')
      return
    }
    setLoading(true)
    try {
      const isEmail = credential.includes('@')
      const digits = credential.replace(/\D/g, '')
      const res = await login({
        email: isEmail ? credential.toLowerCase() : undefined,
        phone: !isEmail ? (digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : credential) : undefined,
        username: credential,
        password: signInPassword,
        role: 'driver',
      })
      toast.success(`Welcome, Driver ${res.user?.name || ''}!`)
      navigate('/driver/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Invalid driver credentials.')
    } finally {
      setLoading(false)
    }
  }

  // Demo Driver Login (Uses real existing database credentials)
  const handleDemoDriverLogin = async () => {
    setLoading(true)
    const email = 'rahul.kumar.driver@gmail.com'
    const password = 'campus2026'
    setSignInCredential(email)
    setSignInPassword(password)
    try {
      const res = await login({
        email,
        password,
        role: 'driver',
      })
      toast.success(`Welcome back, Driver ${res.user?.name || 'Rahul Kumar'}!`)
      navigate('/driver/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Driver demo login failed')
    } finally {
      setLoading(false)
    }
  }

  // Student-as-Driver: verify student account
  const handleSdVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sdSignInEmail || !sdSignInPassword) {
      toast.error('Please enter your student email and password.')
      return
    }
    setSdLoading(true)
    try {
      await login({ email: sdSignInEmail, password: sdSignInPassword })
      setSdVerified(true)
      setSdStep(2)
      toast.success('Student account verified! Now add your vehicle details.')
    } catch (err: any) {
      toast.error(err.message || 'Student login failed. Please check your credentials.')
    } finally {
      setSdLoading(false)
    }
  }

  // Student-as-Driver: register as driver
  const handleSdRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const student = currentStudent || currentUser
    if (!student) {
      toast.error('Student account not found. Please verify first.')
      return
    }
    if (!sdVehicleReg || !sdLicenseNo) {
      toast.error('Please fill in all required fields.')
      return
    }
    setSdLoading(true)
    try {
      await registerDriver({
        fullName: student.name,
        collegeName: (student as any).collegeName || '',
        phone: student.phone,
        email: student.email || '',
        password: sdSignInPassword,
        vehicleRegistration: sdVehicleReg,
        vehicleType: sdVehicleType,
        vehicleCapacity: Number(sdVehicleCapacity) || 4,
        licenseNumber: sdLicenseNo,
        driverType: 'student',
        studentId: (student as any).studentId || (student as any).rollNumber || '',
        rollNumber: (student as any).rollNumber || '',
        availableDays: sdAvailableDays,
        availableTime: sdAvailableTime,
        preferredRoute: sdPreferredRoute,
      })
      toast.success('Registered as Student Driver! Welcome to Campus Flow.', { duration: 5000 })
      navigate('/driver/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'Student driver registration failed.')
    } finally {
      setSdLoading(false)
    }
  }

  const sdHandleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
    let formatted = ''
    if (raw.length <= 4) formatted = raw
    else if (raw.length <= 8) formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`
    else formatted = `${raw.slice(0, 4)} ${raw.slice(4, 8)} ${raw.slice(8, 15)}`
    setSdLicenseNo(formatted)
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const toggleDay = (day: string) => {
    setSdAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            title="CampusFlow Home"
            className="flex items-center gap-2.5 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <Navigation size={18} />
            </div>
            <span className="font-heading font-bold text-slate-900 text-base">
              Campus<span className="text-emerald-600">Flow</span> Driver
            </span>
          </button>

          <button
            onClick={() => navigate('/auth/portal')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Change Portal
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto w-full px-4 py-8 flex-1 flex flex-col justify-center">
        <Card padding="lg" className="border border-slate-200 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                Fleet Operations Portal
              </span>
              <h1 className="font-heading font-bold text-xl text-slate-900">
                {driverType === 'student' ? 'Student as Driver' : `Driver ${mode === 'signup' ? 'Registration' : 'Sign In'}`}
              </h1>
            </div>

            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              {driverType === 'student' ? <GraduationCap size={20} /> : <Car size={20} />}
            </div>
          </div>

          {/* Driver Type Selector */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              type="button"
              onClick={() => { setDriverType('regular'); setStep(1) }}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                driverType === 'regular'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              <Car size={22} />
              <span className="text-xs font-bold">Regular Driver</span>
              <span className="text-[10px] text-center leading-tight opacity-70">Commercial / Fleet</span>
            </button>
            <button
              type="button"
              onClick={() => { setDriverType('student'); setSdStep(1) }}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                driverType === 'student'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              <GraduationCap size={22} />
              <span className="text-xs font-bold">Student as Driver</span>
              <span className="text-[10px] text-center leading-tight opacity-70">Use student account</span>
            </button>
          </div>
          {driverType === 'regular' && (
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-6 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setMode('signin'); setStep(1) }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Driver Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setStep(1) }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Driver Sign Up
            </button>
          </div>
          )}

          {/* SIGN IN FORM — Regular Driver */}
          {driverType === 'regular' && mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Email or Mobile Number
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={signInCredential}
                    onChange={(e) => setSignInCredential(e.target.value)}
                    placeholder="rahul.kumar.driver@gmail.com or 9988776655"
                    className="input-field pl-9 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-9 pr-9 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                variant="primary"
                className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm shadow-md mt-2"
                loading={loading}
              >
                Sign In with Password
                <ArrowRight size={16} />
              </Button>

              {/* Demo Driver 1-Click Button */}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  ⚡ Sandbox Demo Credentials (Existing Record)
                </span>
                <button
                  type="button"
                  onClick={handleDemoDriverLogin}
                  disabled={loading}
                  className="w-full p-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 hover:border-emerald-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      🚗
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-xs">Driver Demo • Rahul Kumar</p>
                      <p className="text-[11px] text-emerald-700 font-mono">Email: rahul.kumar.driver@gmail.com</p>
                      <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                    </div>
                  </div>
                  <Badge variant="green" size="sm" className="font-semibold">
                    Use Demo Credentials →
                  </Badge>
                </button>
              </div>
            </form>
          )}

          {/* SIGN UP MULTI-STEP — Regular Driver */}
          {driverType === 'regular' && mode === 'signup' && (
            <div>
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-6 px-1">
                {[
                  { num: 1, label: 'Personal' },
                  { num: 2, label: 'Vehicle' },
                  { num: 3, label: 'Documents' },
                  { num: 4, label: 'Security' },
                ].map((s) => (
                  <div key={s.num} className="flex items-center gap-1.5 text-xs font-semibold">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        step === s.num
                          ? 'bg-emerald-600 text-white'
                          : step > s.num
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {step > s.num ? '✓' : s.num}
                    </div>
                    <span className={step === s.num ? 'text-slate-900 font-bold' : 'text-slate-400 hidden sm:inline'}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Step 1: Personal Info */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Driver Full Name *
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => { setFullName(e.target.value); setOcrResult(null) }}
                        placeholder="e.g. Rahul Kumar"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. rahul@gmail.com"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number *
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl text-sm font-semibold text-slate-600 select-none">
                        🇮🇳 +91
                      </span>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        value={phone.replace(/^\+91\s?/, '')}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                          setPhone('+91 ' + digits)
                        }}
                        placeholder="9988776655"
                        className="input-field rounded-l-none text-sm flex-1"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">10-digit mobile number</p>
                  </div>

                  <Button
                    size="lg"
                    variant="primary"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm shadow-md mt-4"
                    onClick={() => {
                      const digits = phone.replace(/\D/g, '').replace(/^91/, '')
                      if (!fullName.trim()) {
                        toast.error('Please enter your full name.')
                        return
                      }
                      if (!email.trim() || !email.includes('@')) {
                        toast.error('Please enter a valid email address.')
                        return
                      }
                      if (!/^[6-9]\d{9}$/.test(digits)) {
                        toast.error('Enter a valid 10-digit Indian mobile number starting with 6-9.')
                        return
                      }
                      setStep(2)
                    }}
                  >
                    Next: Vehicle & License Details
                    <ArrowRight size={16} />
                  </Button>
                </div>
              )}

              {/* Step 2: Vehicle Information */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vehicle Registration Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={vehicleReg}
                      onChange={(e) => setVehicleReg(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''))}
                      placeholder="TS 09 AB 1234"
                      maxLength={13}
                      className="input-field text-sm uppercase"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Format: ST 00 AA 0000 (e.g. TS 09 AB 1234)</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Vehicle Type *
                      </label>
                      {vehicleTypeCustom ? (
                        <input
                          type="text"
                          autoFocus
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          placeholder="Enter vehicle type"
                          className="input-field text-sm"
                        />
                      ) : (
                        <select
                          value={vehicleType}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setVehicleTypeCustom(true)
                              setVehicleType('')
                            } else {
                              setVehicleType(e.target.value)
                            }
                          }}
                          className="input-field text-sm"
                        >
                          <option value="Mini Van">Mini Van</option>
                          <option value="Mini Bus">Mini Bus</option>
                          <option value="Auto Rickshaw">Auto Rickshaw</option>
                          <option value="Cab">Cab</option>
                          <option value="__custom__">Other (type manually)</option>
                        </select>
                      )}
                      {vehicleTypeCustom && (
                        <button type="button" onClick={() => { setVehicleTypeCustom(false); setVehicleType('Mini Van') }} className="text-[10px] text-emerald-600 mt-1 hover:underline">← Back to options</button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Vehicle Capacity *
                      </label>
                      {vehicleCapacityCustom ? (
                        <input
                          type="number"
                          autoFocus
                          min="1"
                          value={vehicleCapacity}
                          onChange={(e) => setVehicleCapacity(e.target.value)}
                          placeholder="Enter seat count"
                          className="input-field text-sm"
                        />
                      ) : (
                        <select
                          value={vehicleCapacity}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setVehicleCapacityCustom(true)
                              setVehicleCapacity('')
                            } else {
                              setVehicleCapacity(e.target.value)
                            }
                          }}
                          className="input-field text-sm"
                        >
                          <option value="3">3 seats</option>
                          <option value="4">4 seats</option>
                          <option value="6">6 seats</option>
                          <option value="8">8 seats</option>
                          <option value="12">12 seats</option>
                          <option value="20">20 seats</option>
                          <option value="__custom__">Other (type manually)</option>
                        </select>
                      )}
                      {vehicleCapacityCustom && (
                        <button type="button" onClick={() => { setVehicleCapacityCustom(false); setVehicleCapacity('6') }} className="text-[10px] text-emerald-600 mt-1 hover:underline">← Back to options</button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Driving License No *
                    </label>
                    <input
                      type="text"
                      required
                      value={licenseNo}
                      onChange={handleLicenseChange}
                      placeholder="TS09 2024 0087654"
                      maxLength={17}
                      className="input-field text-sm uppercase"
                    />
                    <div className="flex justify-between items-center text-[10px] mt-0.5">
                      <span className="text-slate-400">Format: SS00 YYYY 0000000 (e.g. TS09 2024 0087654)</span>
                      <span className={licenseNo.replace(/[^A-Z0-9]/g, '').length === 15 ? 'text-emerald-600 font-bold' : 'text-red-500 font-semibold'}>
                        {licenseNo.replace(/[^A-Z0-9]/g, '').length}/15
                      </span>
                    </div>
                    {licenseNo.replace(/[^A-Z0-9]/g, '').length > 0 && licenseNo.replace(/[^A-Z0-9]/g, '').length < 15 && (
                      <p className="text-[10px] text-red-500 mt-0.5">Must be exactly 15 characters</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button
                      size="md"
                      variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={licenseNo.replace(/[^A-Z0-9]/g, '').length !== 15}
                      onClick={() => {
                        const regClean = vehicleReg.replace(/\s/g, '')
                        if (!/^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/.test(regClean)) {
                          toast.error('Invalid registration number. Use format: TS 09 AB 1234')
                          return
                        }
                        const dlClean = licenseNo.replace(/[\s\-]/g, '')
                        if (!/^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/.test(dlClean)) {
                          toast.error('Invalid license number. Must be exactly 15 characters (e.g. TS09 2024 0087654)')
                          return
                        }
                        setStep(3)
                        // Re-run OCR with updated details if license photo already uploaded
                        if (licensePhoto) { setOcrResult(null); runLicenseOcr(licensePhoto) }
                      }}
                    >
                      Next: Document Verification
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Document Uploads & OCR */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Driving License Photo *
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={handleLicenseUpload}
                        className="hidden"
                        id="license-upload"
                      />
                      <label htmlFor="license-upload" className="cursor-pointer flex flex-col items-center">
                        <Upload size={22} className="text-emerald-600 mb-1.5" />
                        <span className="text-xs font-bold text-slate-800">
                          {licensePhoto ? 'License Photo Selected' : 'Upload Driving License Photo'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG up to 5MB</span>
                      </label>
                    </div>
                  </div>

                  {/* OCR Match Check Box */}
                  {licensePhoto && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <FileText size={14} className="text-emerald-600" />
                          License OCR Consistency Check
                        </span>
                        {isScanning && (
                          <span className="text-[10px] text-emerald-600 animate-pulse font-bold flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin" /> Scanning...
                          </span>
                        )}
                      </div>

                      {ocrResult && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Name Entered:</span>
                            <span className="font-bold text-slate-800">{fullName}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Name on License:</span>
                            <span className="font-bold text-slate-800">{detectedName || 'Not detected'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">Name Match:</span>
                            <span className={`font-bold ${ocrResult.nameOk ? 'text-green-600' : 'text-red-500'}`}>
                              {isScanning ? '— Pending' : (ocrResult.nameOk ? '✓ Match' : '✕ Mismatch')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">License No. Entered:</span>
                            <span className="font-bold text-slate-800">{licenseNo}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">License No. on ID:</span>
                            <span className="font-bold text-slate-800">{detectedLicense || 'Not detected'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">DL No. Match:</span>
                            <span className={`font-bold ${ocrResult.dlOk ? 'text-green-600' : 'text-red-500'}`}>
                              {isScanning ? '— Pending' : (ocrResult.dlOk ? '✓ Match' : '✕ Mismatch')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => { setStep(2); setOcrResult(null) }}>
                      Back
                    </Button>
                    <Button
                      size="md"
                      variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold"
                      onClick={() => {
                        if (!licensePhoto) {
                          toast.error('Please upload your driving license photo.')
                          return
                        }
                        if (isScanning) {
                          toast.error('Please wait, scanning is in progress.')
                          return
                        }
                        if (!ocrResult || !ocrResult.isMatch) {
                          if (!ocrResult) {
                            toast.error('License scan not complete. Please wait or re-upload.')
                          } else if (!ocrResult.nameOk) {
                            toast.error('Name on license does not match what you entered.')
                          } else if (!ocrResult.dlOk) {
                            toast.error('License number on the document does not match what you entered.')
                          } else {
                            toast.error('License verification failed. Details do not match.')
                          }
                          return
                        }
                        setStep(4)
                      }}
                    >
                      Next: Password & Submit
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Password & Submit */}
              {step === 4 && (
                <form onSubmit={handleRegister} className="space-y-4">
                  {(() => {
                    const checks = [
                      { label: 'At least 8 characters', ok: password.length >= 8 },
                      { label: 'Uppercase letter (A-Z)', ok: /[A-Z]/.test(password) },
                      { label: 'Lowercase letter (a-z)', ok: /[a-z]/.test(password) },
                      { label: 'Number (0-9)', ok: /[0-9]/.test(password) },
                      { label: 'Symbol (!@#$...)', ok: /[^A-Za-z0-9]/.test(password) },
                    ]
                    const passed = checks.filter((c) => c.ok).length
                    const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][passed]
                    const strengthColor = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'][passed]
                    return (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Create Password *</label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 8 chars, upper, lower, number, symbol"
                            className="input-field pl-9 pr-9 text-sm"
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {password.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex gap-1">
                              {[1,2,3,4,5].map((i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= passed ? strengthColor : 'bg-slate-200'}`} />
                              ))}
                            </div>
                            <p className={`text-[10px] font-bold ${passed <= 1 ? 'text-red-500' : passed <= 2 ? 'text-orange-500' : passed <= 3 ? 'text-yellow-600' : 'text-emerald-600'}`}>{strengthLabel}</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                              {checks.map((c) => (
                                <p key={c.label} className={`text-[10px] flex items-center gap-1 ${c.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {c.ok ? '✓' : '○'} {c.label}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                    {confirmPassword.length > 0 && (
                      <p className={`text-[10px] mt-0.5 font-semibold ${confirmPassword === password ? 'text-emerald-600' : 'text-red-500'}`}>
                        {confirmPassword === password ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      Verification Status: VERIFIED
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Your commercial driver profile and vehicle telematics are <strong>VERIFIED</strong> for university fleet transit operations.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setStep(3)}>
                      Back
                    </Button>
                    <Button
                      type="submit"
                      size="md"
                      variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold"
                      loading={loading}
                    >
                      Complete Registration
                      <CheckCircle2 size={16} />
                    </Button>
                  </div>
                </form>
              )}

              {/* Demo Driver 1-Click Button (Sign Up Mode) */}
              <div className="pt-5 mt-6 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  ⚡ Sandbox Demo Credentials (Existing Record)
                </span>
                <button
                  type="button"
                  onClick={handleDemoDriverLogin}
                  disabled={loading}
                  className="w-full p-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 hover:border-emerald-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      🚗
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-xs">Driver Demo • Rahul Kumar</p>
                      <p className="text-[11px] text-emerald-700 font-mono">Email: rahul.kumar.driver@gmail.com</p>
                      <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                    </div>
                  </div>
                  <Badge variant="green" size="sm" className="font-semibold">
                    Use Demo Credentials →
                  </Badge>
                </button>
              </div>
            </div>
          )}
          {/* STUDENT AS DRIVER FLOW */}
          {driverType === 'student' && (
            <div>
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-5 px-1">
                {[
                  { num: 1, label: 'Verify Student' },
                  { num: 2, label: 'Vehicle' },
                  { num: 3, label: 'Availability' },
                ].map((s) => (
                  <div key={s.num} className="flex items-center gap-1.5 text-xs font-semibold">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      sdStep === s.num ? 'bg-emerald-600 text-white'
                      : sdStep > s.num ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                    }`}>
                      {sdStep > s.num ? '✓' : s.num}
                    </div>
                    <span className={sdStep === s.num ? 'text-slate-900 font-bold' : 'text-slate-400 hidden sm:inline'}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* SD Step 1: Verify student account */}
              {sdStep === 1 && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <GraduationCap size={14} className="text-emerald-600" />
                      Student as Driver
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Use your existing student account to register as a Campus Flow driver. Your student identity will be reused — no duplicate account needed.
                    </p>
                  </div>

                  {sdVerified && (currentStudent || currentUser) ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs space-y-1.5">
                      <p className="font-bold text-green-800 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-green-600" /> Student Verified
                      </p>
                      {[['Name', (currentStudent || currentUser)?.name],
                        ['College', (currentStudent as any)?.collegeName || (currentUser as any)?.collegeName || '—'],
                        ['Roll No.', (currentStudent as any)?.rollNumber || (currentStudent as any)?.studentId || '—'],
                        ['Email', (currentStudent || currentUser)?.email || '—'],
                        ['Phone', (currentStudent || currentUser)?.phone || '—'],
                      ].map(([label, val]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-slate-500">{label}:</span>
                          <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{val}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={handleSdVerify} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Student Email *</label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                          <input type="email" required value={sdSignInEmail}
                            onChange={(e) => setSdSignInEmail(e.target.value)}
                            placeholder="student@campus.edu"
                            className="input-field pl-9 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                          <input type={showPassword ? 'text' : 'password'} required value={sdSignInPassword}
                            onChange={(e) => setSdSignInPassword(e.target.value)}
                            placeholder="••••••••"
                            className="input-field pl-9 pr-9 text-sm" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" size="lg" variant="primary"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm"
                        loading={sdLoading}>
                        Verify Student Account
                        <ArrowRight size={16} />
                      </Button>
                    </form>
                  )}

                  {sdVerified && (
                    <Button size="lg" variant="primary"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm"
                      onClick={() => setSdStep(2)}>
                      Continue: Add Vehicle Details
                      <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              )}

              {/* SD Step 2: Vehicle & License */}
              {sdStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Type *</label>
                    <select value={sdVehicleType} onChange={(e) => setSdVehicleType(e.target.value)}
                      className="input-field text-sm">
                      <option value="Car">Car</option>
                      <option value="Bike">Bike / Two-Wheeler</option>
                      <option value="Auto Rickshaw">Auto Rickshaw</option>
                      <option value="Mini Van">Mini Van</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Registration Number *</label>
                    <input type="text" required value={sdVehicleReg}
                      onChange={(e) => setSdVehicleReg(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''))}
                      placeholder="TS 09 AB 1234" maxLength={13}
                      className="input-field text-sm uppercase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity (seats) *</label>
                      <select value={sdVehicleCapacity} onChange={(e) => setSdVehicleCapacity(e.target.value)}
                        className="input-field text-sm">
                        <option value="2">2 seats</option>
                        <option value="3">3 seats</option>
                        <option value="4">4 seats</option>
                        <option value="6">6 seats</option>
                        <option value="7">7 seats</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Driving Licence No *</label>
                      <input type="text" required value={sdLicenseNo}
                        onChange={sdHandleLicenseChange}
                        placeholder="TS09 2024 0087654" maxLength={17}
                        className="input-field text-sm uppercase" />
                      <div className="flex justify-end text-[10px] mt-0.5">
                        <span className={sdLicenseNo.replace(/[^A-Z0-9]/g, '').length === 15 ? 'text-emerald-600 font-bold' : 'text-red-500 font-semibold'}>
                          {sdLicenseNo.replace(/[^A-Z0-9]/g, '').length}/15
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setSdStep(1)}>Back</Button>
                    <Button size="md" variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold"
                      disabled={!sdVehicleReg || sdLicenseNo.replace(/[^A-Z0-9]/g, '').length !== 15}
                      onClick={() => {
                        if (!sdVehicleReg.trim()) { toast.error('Enter vehicle registration number.'); return }
                        if (sdLicenseNo.replace(/[^A-Z0-9]/g, '').length !== 15) { toast.error('License must be exactly 15 characters.'); return }
                        setSdStep(3)
                      }}>
                      Next: Availability
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {/* SD Step 3: Availability & Submit */}
              {sdStep === 3 && (
                <form onSubmit={handleSdRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Available Days *</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day) => (
                        <button key={day} type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all cursor-pointer ${
                            sdAvailableDays.includes(day)
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Available Time Slot</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={sdAvailableTime}
                        onChange={(e) => setSdAvailableTime(e.target.value)}
                        placeholder="e.g. 8:00 AM – 10:00 AM"
                        className="input-field pl-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Route / Area</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={sdPreferredRoute}
                        onChange={(e) => setSdPreferredRoute(e.target.value)}
                        placeholder="e.g. Hostel A → College Gate"
                        className="input-field pl-9 text-sm" />
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      Route Lock Policy
                    </p>
                    <p className="text-[11px] leading-relaxed mt-0.5">
                      As a Student Driver, your assigned route will be <strong>LOCKED</strong> and will not be re-optimized due to empty seats or passenger changes.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setSdStep(2)}>Back</Button>
                    <Button type="submit" size="md" variant="primary"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold"
                      loading={sdLoading}>
                      Register as Student Driver
                      <CheckCircle2 size={16} />
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
          {/* STUDENT AS DRIVER FLOW */}
          {driverType === 'student' && (
            <div>
              <div className="flex items-center justify-between mb-5 px-1">
                {[{ num: 1, label: 'Verify Student' }, { num: 2, label: 'Vehicle' }, { num: 3, label: 'Availability' }].map((s) => (
                  <div key={s.num} className="flex items-center gap-1.5 text-xs font-semibold">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      sdStep === s.num ? 'bg-emerald-600 text-white' : sdStep > s.num ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>{sdStep > s.num ? '✓' : s.num}</div>
                    <span className={sdStep === s.num ? 'text-slate-900 font-bold' : 'text-slate-400 hidden sm:inline'}>{s.label}</span>
                  </div>
                ))}
              </div>

              {sdStep === 1 && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                    <p className="font-bold flex items-center gap-1.5 mb-1"><GraduationCap size={14} className="text-emerald-600" />Student as Driver</p>
                    <p className="text-[11px] leading-relaxed">Use your existing student account to register as a Campus Flow driver. No duplicate account needed.</p>
                  </div>
                  {sdVerified && (currentStudent || currentUser) ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs space-y-1.5">
                      <p className="font-bold text-green-800 flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" />Student Verified</p>
                      {[['Name', (currentStudent || currentUser)?.name], ['College', (currentStudent as any)?.collegeName || (currentUser as any)?.collegeName || '—'], ['Roll No.', (currentStudent as any)?.rollNumber || (currentStudent as any)?.studentId || '—'], ['Email', (currentStudent || currentUser)?.email || '—'], ['Phone', (currentStudent || currentUser)?.phone || '—']].map(([label, val]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-slate-500">{label}:</span>
                          <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{val}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={handleSdVerify} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Student Email *</label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                          <input type="email" required value={sdSignInEmail} onChange={(e) => setSdSignInEmail(e.target.value)} placeholder="student@campus.edu" className="input-field pl-9 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Password *</label>
                        <div className="relative">
                          <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                          <input type={showPassword ? 'text' : 'password'} required value={sdSignInPassword} onChange={(e) => setSdSignInPassword(e.target.value)} placeholder="••••••••" className="input-field pl-9 pr-9 text-sm" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                        </div>
                      </div>
                      <Button type="submit" size="lg" variant="primary" className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm" loading={sdLoading}>
                        Verify Student Account <ArrowRight size={16} />
                      </Button>
                    </form>
                  )}
                  {sdVerified && (
                    <Button size="lg" variant="primary" className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-sm" onClick={() => setSdStep(2)}>
                      Continue: Add Vehicle Details <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              )}

              {sdStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Type *</label>
                    <select value={sdVehicleType} onChange={(e) => setSdVehicleType(e.target.value)} className="input-field text-sm">
                      <option value="Car">Car</option>
                      <option value="Bike">Bike / Two-Wheeler</option>
                      <option value="Auto Rickshaw">Auto Rickshaw</option>
                      <option value="Mini Van">Mini Van</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Registration Number *</label>
                    <input type="text" required value={sdVehicleReg} onChange={(e) => setSdVehicleReg(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''))} placeholder="TS 09 AB 1234" maxLength={13} className="input-field text-sm uppercase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity (seats) *</label>
                      <select value={sdVehicleCapacity} onChange={(e) => setSdVehicleCapacity(e.target.value)} className="input-field text-sm">
                        <option value="2">2 seats</option>
                        <option value="3">3 seats</option>
                        <option value="4">4 seats</option>
                        <option value="6">6 seats</option>
                        <option value="7">7 seats</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Driving Licence No *</label>
                      <input type="text" required value={sdLicenseNo} onChange={sdHandleLicenseChange} placeholder="TS09 2024 0087654" maxLength={17} className="input-field text-sm uppercase" />
                      <div className="flex justify-end text-[10px] mt-0.5">
                        <span className={sdLicenseNo.replace(/[^A-Z0-9]/g, '').length === 15 ? 'text-emerald-600 font-bold' : 'text-red-500 font-semibold'}>{sdLicenseNo.replace(/[^A-Z0-9]/g, '').length}/15</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setSdStep(1)}>Back</Button>
                    <Button size="md" variant="primary" className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold" disabled={!sdVehicleReg || sdLicenseNo.replace(/[^A-Z0-9]/g, '').length !== 15}
                      onClick={() => {
                        if (!sdVehicleReg.trim()) { toast.error('Enter vehicle registration number.'); return }
                        if (sdLicenseNo.replace(/[^A-Z0-9]/g, '').length !== 15) { toast.error('License must be exactly 15 characters.'); return }
                        setSdStep(3)
                      }}>
                      Next: Availability <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {sdStep === 3 && (
                <form onSubmit={handleSdRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Available Days *</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day) => (
                        <button key={day} type="button" onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all cursor-pointer ${
                            sdAvailableDays.includes(day) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}>{day}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Available Time Slot</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={sdAvailableTime} onChange={(e) => setSdAvailableTime(e.target.value)} placeholder="e.g. 8:00 AM – 10:00 AM" className="input-field pl-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Route / Area</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={sdPreferredRoute} onChange={(e) => setSdPreferredRoute(e.target.value)} placeholder="e.g. Hostel A → College Gate" className="input-field pl-9 text-sm" />
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                    <p className="font-bold flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" />Route Lock Policy</p>
                    <p className="text-[11px] leading-relaxed mt-0.5">As a Student Driver, your assigned route will be <strong>LOCKED</strong> and will not be re-optimized due to empty seats or passenger changes.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setSdStep(2)}>Back</Button>
                    <Button type="submit" size="md" variant="primary" className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-bold" loading={sdLoading}>
                      Register as Student Driver <CheckCircle2 size={16} />
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </Card>
      </main>

      <footer className="py-4 text-center text-xs text-slate-400 bg-white border-t border-slate-200">
        CampusFlow Mobility • Driver Fleet Operations
      </footer>
    </div>
  )
}
