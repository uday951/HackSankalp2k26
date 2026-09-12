import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fuzzyMatchId,
  preprocessImage, extractStudentFields, verifyCollegeInOcrText,
  searchNameInFullText,
} from '../../lib/ocrUtils'
import { validateInstitutionalEmail } from '../../lib/emailValidation'
import {
  Navigation, User, GraduationCap, ArrowLeft, ArrowRight, CheckCircle2,
  AlertTriangle, Upload, Eye, EyeOff, ShieldCheck, Mail, Lock, Phone,
  Building, Hash, RefreshCw, FileText
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { api } from '../../services/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { compressImage } from '../../lib/utils'

export default function StudentFacultyAuth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'

  const login = useAppStore((s) => s.login)
  const registerStudent = useAppStore((s) => s.registerStudent)
  const registerFaculty = useAppStore((s) => s.registerFaculty)
  const students = useAppStore((s) => s.students)


  // Portal Type: 'student' | 'faculty'
  const [userType, setUserType] = useState<'student' | 'faculty'>('student')
  // Auth Mode: 'signin' | 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)

  // Multi-step Registration Wizard
  const [step, setStep] = useState<number>(1)

  // Form Fields
  const [fullName, setFullName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [collegeId, setCollegeId] = useState('')
  const [collegeName, setCollegeName] = useState('')
  const [collegeEmail, setCollegeEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState<'' | 'Female' | 'Male' | 'Other' | 'Prefer not to say'>('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Email verification state
  const [emailChecked, setEmailChecked] = useState(false)
  const [emailValid, setEmailValid] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [domainMessage, setDomainMessage] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [isCodeVerified, setIsCodeVerified] = useState(false)

  // Document Upload & OCR State
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null)
  const [detectedName, setDetectedName] = useState('')
  const [detectedCollege, setDetectedCollege] = useState('')
  const [detectedRoll, setDetectedRoll] = useState('')
  const [ocrResult, setOcrResult] = useState<{
    matchScore: number
    isMatch: boolean
    nameOk: boolean
    rollOk: boolean
    collegeOk: boolean
    hasOcrText: boolean
    status: 'MATCHED' | 'MISMATCH'
    statusLabel: string
    explanation: string
  } | null>(null)
  const [isScanningOcr, setIsScanningOcr] = useState(false)

  // Sign In State
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // --- 1. Email Domain Check ---
  const handleVerifyEmail = async () => {
    if (!collegeEmail || !collegeEmail.includes('@')) {
      toast.error('Please enter a valid college email.')
      return
    }

    try {
      const res = await api.verifyEmailDomain(collegeEmail)
      setEmailChecked(true)
      setEmailValid(res.isValid)
      setDomainMessage(res.message)

      if (res.isValid) {
        // Generate simulated 4-digit prototype verification code
        const genCode = Math.floor(1000 + Math.random() * 9000).toString()
        setDemoCode(genCode)
        toast.success(`Domain verified! Prototype verification code: ${genCode}`, { duration: 6000 })
      } else {
        toast.error(res.message || 'Email domain is not authorized for institutional registration.')
      }
    } catch {
      // Reusable offline fallback check
      const validation = validateInstitutionalEmail(collegeEmail)
      setEmailChecked(true)
      setEmailValid(validation.isValid)
      setDomainMessage(validation.message)
      if (validation.isValid) {
        const genCode = '2026'
        setDemoCode(genCode)
        toast.success(`Domain verified! Prototype code: 2026`, { duration: 6000 })
      } else {
        toast.error(validation.message)
      }
    }
  }

  // --- 2. ID Card Upload & Prototype OCR ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast.error('Only JPG, JPEG, and PNG files are supported.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB.')
      return
    }

    setIdCardFile(file)
    const reader = new FileReader()
    reader.onload = async () => {
      const rawUri = reader.result as string
      try {
        const compressed = await compressImage(rawUri, 1000, 1000, 0.75)
        setIdCardPreview(compressed)
        runOcrAnalysis(compressed)
      } catch {
        setIdCardPreview(rawUri)
        runOcrAnalysis(rawUri)
      }
    }
    reader.readAsDataURL(file)
  }

  const runOcrAnalysis = async (fileDataUri: string) => {
    setIsScanningOcr(true)
    try {
      const processed = await preprocessImage(fileDataUri)
      const { name, roll, college, fullText } = await extractStudentFields(processed, fileDataUri)

      const targetId = userType === 'student' ? rollNumber : collegeId

      // Name: search entered name across the FULL OCR text, not just extracted field
      const nameSearch = searchNameInFullText(fullName, fullText)
      const nameOk = nameSearch.found
      const detectedNameValue = nameSearch.detectedValue || name

      // Roll: exact/normalized match only — mismatch stays mismatch
      const rollOk = Boolean(roll && targetId && fuzzyMatchId(targetId, roll))

      // College: search entered college anywhere in full OCR text
      const collegeCheck = verifyCollegeInOcrText(collegeName, fullText)
      const collegeOk = collegeCheck.isMatch

      const collegeFound = collegeCheck.matchedText || college || ''
      setDetectedName(detectedNameValue)
      setDetectedRoll(roll)
      setDetectedCollege(collegeFound)

      console.debug('[OCR] nameSearch:', nameSearch)
      console.debug('[OCR] rollOk:', rollOk, '| entered:', targetId, '| detected:', roll)
      console.debug('[OCR] collegeOk:', collegeOk, '| matched:', collegeFound)

      const hasOcrText = Boolean(fullText && fullText.trim().length >= 3)
      const isMatch = nameOk && rollOk && collegeOk

      setOcrResult({
        matchScore: (nameOk ? 34 : 0) + (rollOk ? 33 : 0) + (collegeOk ? 33 : 0),
        isMatch,
        nameOk,
        rollOk,
        collegeOk,
        hasOcrText,
        status: isMatch ? 'MATCHED' : 'MISMATCH',
        statusLabel: isMatch ? '✓ Verified' : '✗ Verification Mismatch',
        explanation: `Name: ${nameOk ? 'Match' : (name ? 'Mismatch' : 'Not detected')}, Roll/ID: ${rollOk ? 'Match' : (roll ? 'Mismatch' : 'Not detected')}, College: ${collegeOk ? 'Match' : (hasOcrText ? 'Mismatch' : 'Not detected')}`,
      })
    } catch {
      setDetectedName('')
      setDetectedRoll('')
      setDetectedCollege('')
      setOcrResult({
        matchScore: 0,
        isMatch: false,
        nameOk: false,
        rollOk: false,
        collegeOk: false,
        hasOcrText: false,
        status: 'MISMATCH',
        statusLabel: '⚠️ Unable to read ID card. Please upload a clearer image.',
        explanation: 'Unable to read ID card. Please upload a clearer image.',
      })
      toast.error('Unable to read ID card. Please upload a clearer image.')
    } finally {
      setIsScanningOcr(false)
    }
  }

  // --- 3. Complete Registration ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName || !collegeEmail || !password || (userType === 'student' && !gender)) {
      toast.error('Please complete all required fields.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      toast.error('Password must be 6+ chars with uppercase, lowercase, number and symbol.')
      return
    }

    setLoading(true)
    try {
      if (userType === 'student') {
        await registerStudent({
          fullName,
          rollNumber: rollNumber || `STU-${Date.now().toString().slice(-4)}`,
          collegeName,
          collegeEmail,
          phone,
          password,
          gender,
          idCardPhoto: idCardPreview || undefined,
          detectedName: detectedName || fullName,
        })
        toast.success('Registration successful! Account is verified.', { duration: 5000 })
        navigate('/student/home')
      } else {
        await registerFaculty({
          fullName,
          collegeId: collegeId || `FAC-${Date.now().toString().slice(-4)}`,
          collegeName,
          collegeEmail,
          phone,
          password,
          idCardPhoto: idCardPreview || undefined,
          detectedName: detectedName || fullName,
        })
        toast.success('Faculty registered! Account is verified.', { duration: 5000 })
        navigate('/student/home')
      }
    } catch (err: any) {
      toast.error(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  // --- 4. Sign In ---
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInEmail || !signInPassword) {
      toast.error('Please enter your college email and password.')
      return
    }

    setLoading(true)
    try {
      const res = await login({
        email: signInEmail,
        password: signInPassword,
      })
      toast.success(`Welcome back, ${res.user?.name || 'Commuter'}!`)
      navigate('/student/home')
    } catch (err: any) {
      toast.error(err.message || 'Invalid college email or password.')
    } finally {
      setLoading(false)
    }
  }

  // Reset all signup form state
  const resetSignupForm = () => {
    setStep(1)
    setFullName('')
    setRollNumber('')
    setCollegeId('')
    setCollegeName('')
    setCollegeEmail('')
    setPhone('')
    setPassword('')
    setGender('')
    setConfirmPassword('')
    setShowPassword(false)
    setEmailChecked(false)
    setEmailValid(false)
    setEmailExists(false)
    setDomainMessage('')
    setDemoCode('')
    setInputCode('')
    setIsCodeVerified(false)
    setIdCardFile(null)
    setIdCardPreview(null)
    setDetectedName('')
    setDetectedCollege('')
    setDetectedRoll('')
    setOcrResult(null)
  }

  // Quick Demo Login Handler (Uses real existing database credentials)
  const handleQuickDemoLogin = async (role: 'student' | 'faculty') => {
    setLoading(true)
    const email = role === 'student' ? 'uday.kiran@sriindu.ac.in' : 'ramesh.sharma@sriindu.ac.in'
    const password = 'campus2026'
    setSignInEmail(email)
    setSignInPassword(password)
    try {
      const res = await login({ email, password, role })
      toast.success(`Welcome back, ${res.user?.name || (role === 'student' ? 'Uday Kiran' : 'Dr. Ramesh Sharma')}!`)
      navigate('/student/home')
    } catch (err: any) {
      toast.error(err.message || 'Demo login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-primary-500 selection:text-white">
      {/* Top Navbar */}
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            title="CampusFlow Home"
            className="flex items-center gap-2.5 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shadow-sm">
              <Navigation size={18} />
            </div>
            <span className="font-heading font-bold text-slate-900 text-base">
              Campus<span className="text-primary-600">Flow</span>
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

      {/* Main Card */}
      <main className="max-w-xl mx-auto w-full px-4 py-8 flex-1 flex flex-col justify-center">
        <Card padding="lg" className="border border-slate-200 shadow-sm bg-white">
          {/* 1. Portal & Role Selector */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider block">
                Commuter Portal
              </span>
              <h1 className="font-heading font-bold text-xl text-slate-900">
                {userType === 'student' ? 'Student' : 'Faculty'} {mode === 'signup' ? 'Registration' : 'Sign In'}
              </h1>
            </div>

            {/* Role Tab (Student / Faculty) */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => { if (userType !== 'student') { setUserType('student'); resetSignupForm() } }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  userType === 'student' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <User size={13} />
                Student
              </button>
              <button
                type="button"
                onClick={() => { if (userType !== 'faculty') { setUserType('faculty'); resetSignupForm() } }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  userType === 'faculty' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <GraduationCap size={13} />
                Faculty
              </button>
            </div>
          </div>

          {/* 2. Sign In vs Sign Up Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-6 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setStep(1)
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setStep(1)
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
            >
              Sign Up
            </button>
          </div>

          {/* ============================================================== */}
          {/* SIGN IN FORM                                                   */}
          {/* ============================================================== */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  College Email or Roll Number
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="student@campus.edu"
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
                className="w-full bg-primary-600 hover:bg-primary-500 font-bold text-sm shadow-md mt-2"
                loading={loading}
              >
                Sign In with Password
                <ArrowRight size={16} />
              </Button>


              {/* Quick 1-Click Demo Account for Evaluators */}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  ⚡ Sandbox Demo Credentials (Existing Record)
                </span>
                {userType === 'student' ? (
                  <button
                    type="button"
                    onClick={() => handleQuickDemoLogin('student')}
                    disabled={loading}
                    className="w-full p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        🎓
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-xs">Student Demo • Uday Kiran</p>
                        <p className="text-[11px] text-primary-700 font-mono">Email: uday.kiran@sriindu.ac.in</p>
                        <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                      </div>
                    </div>
                    <Badge variant="blue" size="sm" className="font-semibold">
                      Use Demo Credentials →
                    </Badge>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuickDemoLogin('faculty')}
                    disabled={loading}
                    className="w-full p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        👨‍🏫
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-xs">Faculty Demo • Dr. Ramesh Sharma</p>
                        <p className="text-[11px] text-primary-700 font-mono">Email: ramesh.sharma@sriindu.ac.in</p>
                        <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                      </div>
                    </div>
                    <Badge variant="blue" size="sm" className="font-semibold">
                      Use Demo Credentials →
                    </Badge>
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* SIGN UP MULTI-STEP WIZARD                                      */}
          {/* ============================================================== */}
          {mode === 'signup' && (
            <div>
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-6 px-1">
                {[
                  { num: 1, label: 'Profile' },
                  { num: 2, label: 'Email Check' },
                  { num: 3, label: 'ID Upload' },
                  { num: 4, label: 'Security' },
                ].map((s) => (
                  <div key={s.num} className="flex items-center gap-1.5 text-xs font-semibold">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s.num
                          ? 'bg-primary-600 text-white'
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

              {/* Step 1: Personal & College Info */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name (As on College ID) *
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => { setFullName(e.target.value); setOcrResult(null) }}
                        placeholder="e.g. Arjun Rao"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {userType === 'student' ? 'Roll Number / Hall Ticket No *' : 'Faculty ID *'}
                      </label>
                      <div className="relative">
                        <Hash size={16} className="absolute left-3 top-3 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={userType === 'student' ? rollNumber : collegeId}
                          onChange={(e) => {
                            userType === 'student' ? setRollNumber(e.target.value.toUpperCase()) : setCollegeId(e.target.value)
                            setOcrResult(null)
                          }}
                          placeholder={userType === 'student' ? 'e.g. CSE2022015 or 22A91A0501' : 'FAC-1042'}
                          className="input-field pl-9 text-sm"
                        />
                      </div>

                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone Number
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
                            setPhone('+91' + digits)
                          }}
                          placeholder="9876543210"
                          className="input-field rounded-l-none text-sm flex-1"
                        />
                      </div>
                      {phone.replace(/^\+91/, '').length > 0 && phone.replace(/^\+91/, '').length < 10 && (
                        <p className="text-[10px] text-red-500 mt-0.5">Must be exactly 10 digits</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      College / University *
                    </label>
                    <div className="relative">
                      <Building size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={collegeName}
                        onChange={(e) => { setCollegeName(e.target.value); setOcrResult(null) }}
                        placeholder="e.g. SRI INDU College of Engineering & Technology"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Must match the college name on your ID card</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Gender *
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as any)}
                      className="input-field text-sm font-medium text-slate-800"
                    >
                      <option value="">Choose your gender</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>

                  <Button
                    size="lg"
                    variant="primary"
                    className="w-full bg-primary-600 hover:bg-primary-500 font-bold text-sm shadow-md mt-4"
                    onClick={() => {
                      if (!fullName.trim()) { toast.error('Please enter your full name.'); return }
                      if (userType === 'student' && !rollNumber.trim()) { toast.error('Please enter your roll number.'); return }
                      if (!collegeName.trim()) { toast.error('Please enter your college name.'); return }
                      const digits = phone.replace(/^\+91/, '')
                      if (digits.length !== 10) { toast.error('Enter a valid 10-digit mobile number.'); return }
                      if (!gender) { toast.error('Please choose your gender.'); return }
                      setStep(2)
                    }}
                  >
                    Next: College Email Validation
                    <ArrowRight size={16} />
                  </Button>
                </div>
              )}

              {/* Step 2: College Email Verification */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Official College Email *
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Must be an official educational/institutional email (e.g., <code>@college.ac.in</code>, <code>@university.edu.in</code>, <code>@institute.res.in</code>)
                    </p>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={collegeEmail}
                        onChange={(e) => {
                          setCollegeEmail(e.target.value)
                          setEmailChecked(false)
                          setIsCodeVerified(false)
                          setEmailExists(false)
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (!val || !val.includes('@')) return
                          const exists = students.some((s) => s.email?.toLowerCase() === val.toLowerCase())
                          setEmailExists(exists)
                        }}
                        placeholder="arjun.rao@campus.edu"
                        className="input-field pl-9 text-sm"
                      />
                    </div>
                    {emailExists && (
                      <p className="text-[10px] text-red-500 font-semibold mt-0.5">
                        ✗ This email is already registered. Please sign in instead.
                      </p>
                    )}
                  </div>

                  {!emailChecked ? (
                    <Button
                      size="md"
                      variant="secondary"
                      className="w-full text-xs font-bold"
                      onClick={() => { if (emailExists) { toast.error('Email already registered. Please sign in.'); return } handleVerifyEmail() }}
                    >
                      Check Email Domain & Send Prototype Code
                    </Button>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center gap-2">
                        {emailValid ? (
                          <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                        )}
                        <span className={emailValid ? 'text-green-800 font-bold' : 'text-red-700 font-semibold'}>
                          {domainMessage}
                        </span>
                      </div>

                      {emailValid && (
                        <div className="pt-2 border-t border-slate-200">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Enter Prototype Verification Code:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              value={inputCode}
                              onChange={(e) => setInputCode(e.target.value)}
                              placeholder={`Enter code (${demoCode})`}
                              className="input-field text-xs uppercase font-mono tracking-widest flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (inputCode === demoCode || inputCode === '2026') {
                                  setIsCodeVerified(true)
                                  toast.success('Email prototype verification successful!')
                                } else {
                                  toast.error('Incorrect code. Try ' + demoCode)
                                }
                              }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 cursor-pointer"
                            >
                              Verify
                            </button>
                          </div>
                          {isCodeVerified && (
                            <p className="text-[10px] text-green-700 font-bold mt-1">
                              ✓ Email verified for prototype registration
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button
                      size="md"
                      variant="primary"
                      className="flex-1 bg-primary-600 hover:bg-primary-500 font-bold"
                      disabled={!isCodeVerified || emailExists}
                      onClick={() => {
                        if (!isCodeVerified) { toast.error('Please verify your email with the code first.'); return }
                        if (emailExists) { toast.error('Email already registered. Please sign in.'); return }
                        setStep(3)
                        // Re-run OCR with updated details if image already uploaded
                        if (idCardPreview) { setOcrResult(null); runOcrAnalysis(idCardPreview) }
                      }}
                    >
                      Next: ID Card Upload
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: ID Card Upload & Prototype OCR */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Upload College ID Card Photo *
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Upload your college ID card for verification. Our OCR engine performs automated name consistency checking.
                    </p>

                    {/* File Dropzone */}
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:border-primary-500 transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={handleFileChange}
                        className="hidden"
                        id="id-card-upload"
                      />
                      <label htmlFor="id-card-upload" className="cursor-pointer flex flex-col items-center">
                        <Upload size={24} className="text-primary-600 mb-2" />
                        <span className="text-xs font-bold text-slate-800">
                          {idCardFile ? idCardFile.name : 'Click to select ID Card image'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG up to 5MB</span>
                      </label>
                    </div>
                  </div>

                  {/* ID Card Preview */}
                  {idCardPreview && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <FileText size={14} className="text-primary-600" />
                          Document Preview & OCR Scan
                        </span>
                        {isScanningOcr && (
                          <span className="text-[10px] text-primary-600 animate-pulse font-bold flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin" /> Scanning...
                          </span>
                        )}
                      </div>

                      <div className="max-h-32 overflow-hidden rounded-lg border border-slate-200 mb-3 bg-slate-100 flex items-center justify-center">
                        <img src={idCardPreview} alt="ID Card Preview" className="w-full object-cover max-h-32" />
                      </div>

                      {/* OCR Name + College Matching Box */}
                      {ocrResult && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Name Entered:</span>
                            <span className="font-bold text-slate-800">{fullName}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Name on ID:</span>
                            <span className="font-bold text-slate-800">{detectedName || 'Not detected'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">Name Match:</span>
                            <span className={`font-bold ${ocrResult.nameOk ? 'text-green-600' : (detectedName ? 'text-red-500' : 'text-amber-500')}`}>
                              {isScanningOcr ? '— Pending' : (ocrResult.nameOk ? '✓ Match' : (detectedName ? '✕ Mismatch' : 'Not detected'))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">
                              {userType === 'student' ? 'Roll / Hall Ticket Entered:' : 'Faculty ID Entered:'}
                            </span>
                            <span className="font-bold text-slate-800">{userType === 'student' ? rollNumber : collegeId}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">
                              {userType === 'student' ? 'Roll / Hall Ticket on ID:' : 'Faculty ID on ID:'}
                            </span>
                            <span className="font-bold text-slate-800">{detectedRoll || 'Not detected'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">
                              {userType === 'student' ? 'Roll Match:' : 'ID Match:'}
                            </span>
                            <span className={`font-bold ${ocrResult.rollOk ? 'text-green-600' : (detectedRoll ? 'text-red-500' : 'text-amber-500')}`}>
                              {isScanningOcr ? '— Pending' : (ocrResult.rollOk ? '✓ Match' : (detectedRoll ? '✕ Mismatch' : 'Not detected'))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">College Entered:</span>
                            <span className="font-bold text-slate-800 text-right max-w-[55%]">{collegeName}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">College Found in ID:</span>
                            <span className="font-bold text-slate-800 text-right max-w-[55%]">{detectedCollege || 'Not detected'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-500">College Match:</span>
                            <span className={`font-bold ${ocrResult.collegeOk ? 'text-green-600' : (ocrResult.hasOcrText ? 'text-red-500' : 'text-amber-500')}`}>
                              {isScanningOcr ? '— Pending' : (ocrResult.collegeOk ? '✓ Match' : (ocrResult.hasOcrText ? '✕ Mismatch' : 'Not detected'))}
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
                      className="flex-1 bg-primary-600 hover:bg-primary-500 font-bold"
                      onClick={() => {
                        if (!idCardPreview) {
                          toast.error('Please upload your college ID card photo.')
                          return
                        }
                        if (isScanningOcr) {
                          toast.error('Please wait, scanning in progress.')
                          return
                        }
                        if (!ocrResult || !ocrResult.isMatch) {
                          if (!ocrResult) {
                            toast.error('Please wait for the scan to complete.')
                          } else if (!ocrResult.nameOk) {
                            toast.error('Name on ID card does not match what you entered.')
                          } else if (!ocrResult.rollOk) {
                            toast.error(`${userType === 'student' ? 'Roll number' : 'Faculty ID'} on ID card does not match what you entered.`)
                          } else if (!ocrResult.collegeOk) {
                            toast.error('College name on ID card does not match what you entered.')
                          } else {
                            toast.error('ID card verification failed. Details do not match.')
                          }
                          return
                        }
                        setStep(4)
                      }}
                    >
                      Next: Account Security
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
                      { label: 'At least 6 characters', ok: password.length >= 6 },
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
                            placeholder="Min 6 chars, upper, lower, number, symbol"
                            className="input-field pl-9 pr-9 text-sm"
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {password.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((i) => (
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password *
                    </label>
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
                      Your university credentials and identity are <strong>VERIFIED</strong>. You can book campus rides immediately.
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
                      className="flex-1 bg-primary-600 hover:bg-primary-500 font-bold"
                      loading={loading}
                    >
                      Complete Registration
                      <CheckCircle2 size={16} />
                    </Button>
                  </div>
                </form>
              )}

              {/* Quick 1-Click Demo Login for Evaluators (Sign Up Mode) */}
              <div className="pt-5 mt-6 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  ⚡ Sandbox Demo Credentials (Existing Record)
                </span>
                {userType === 'student' ? (
                  <button
                    type="button"
                    onClick={() => handleQuickDemoLogin('student')}
                    disabled={loading}
                    className="w-full p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        🎓
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-xs">Student Demo • Uday Kiran</p>
                        <p className="text-[11px] text-primary-700 font-mono">Email: uday.kiran@sriindu.ac.in</p>
                        <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                      </div>
                    </div>
                    <Badge variant="blue" size="sm" className="font-semibold">
                      Use Demo Credentials →
                    </Badge>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuickDemoLogin('faculty')}
                    disabled={loading}
                    className="w-full p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all flex items-center justify-between group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        👨‍🏫
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-xs">Faculty Demo • Dr. Ramesh Sharma</p>
                        <p className="text-[11px] text-primary-700 font-mono">Email: ramesh.sharma@sriindu.ac.in</p>
                        <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                      </div>
                    </div>
                    <Badge variant="blue" size="sm" className="font-semibold">
                      Use Demo Credentials →
                    </Badge>
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      </main>

      <footer className="py-4 text-center text-xs text-slate-400 bg-white border-t border-slate-200">
        CampusFlow Mobility • Student & Faculty Portal
      </footer>
    </div>
  )
}
