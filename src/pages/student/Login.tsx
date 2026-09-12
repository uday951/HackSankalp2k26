import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Navigation, ChevronRight, Shield, CheckCircle, Mail, Lock, UserPlus, Zap } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import Button from '../../components/ui/Button'
import { api } from '../../services/api'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const login = useAppStore((s) => s.login)
  const loginAsStudent = useAppStore((s) => s.loginAsStudent)
  const storeStudents = useAppStore((s) => s.students)
  const [realStudents, setRealStudents] = useState(storeStudents)

  useEffect(() => {
    api.getStudents().then((res) => {
      if (Array.isArray(res) && res.length > 0) {
        setRealStudents(res)
      }
    }).catch(() => {})
  }, [])


  const [tab, setTab] = useState<'credentials' | 'quick'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedId, setSelectedId] = useState('s1')
  const [loading, setLoading] = useState(false)

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error('Please enter your university email')
      return
    }
    if (!password) {
      toast.error('Please enter your password')
      return
    }

    setLoading(true)
    try {
      await login({ email, password, role: 'student' })
      toast.success('Signed in successfully!')
      navigate('/student/home')
    } catch (err: any) {
      toast.error(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (role: 'student' | 'faculty') => {
    setLoading(true)
    const demoEmail = role === 'student' ? 'uday.kiran@sriindu.ac.in' : 'ramesh.sharma@sriindu.ac.in'
    const demoPassword = 'campus2026'
    setEmail(demoEmail)
    setPassword(demoPassword)
    try {
      const res = await login({ email: demoEmail, password: demoPassword, role })
      toast.success(`Welcome back, ${res.user?.name || (role === 'student' ? 'Uday Kiran' : 'Dr. Ramesh Sharma')}!`)
      navigate('/student/home')
    } catch (err: any) {
      toast.error(err.message || 'Demo login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-md">
            <Navigation size={22} className="text-white" />
          </div>
          <div>
            <span className="font-heading font-bold text-slate-900 text-xl leading-tight">Campus</span>
            <span className="font-heading font-bold text-primary-600 text-xl leading-tight ml-1">Mobility</span>
          </div>
        </div>

        <h1 className="font-heading font-bold text-2xl text-center text-slate-900 mb-1">Student Portal</h1>
        <p className="text-slate-500 text-sm text-center mb-6">Sign in to book rides, join carpools, and track shuttles</p>

        {/* Tab switch */}
        <div className="flex bg-slate-200/80 p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setTab('credentials')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === 'credentials' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Email & Password
          </button>
          <button
            type="button"
            onClick={() => setTab('quick')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
              tab === 'quick' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap size={12} className="text-amber-500" />
            Quick Demo Select
          </button>
        </div>

        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-8">
          {tab === 'credentials' ? (
            <form onSubmit={handleCredentialsLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">University Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="student@sriindu.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button size="lg" className="w-full" type="submit" loading={loading}>
                  Sign In with Password
                  <ChevronRight size={18} />
                </Button>
              </div>

            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 mb-2 font-medium">Sandbox Demo Credentials (Existing Record):</p>
              
              {/* Student Demo */}
              <button
                type="button"
                onClick={() => handleDemoLogin('student')}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    🎓
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-xs">Student Demo • Uday Kiran</p>
                    <p className="text-[11px] text-primary-700 font-mono">Email: uday.kiran@sriindu.ac.in</p>
                    <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-primary-600 group-hover:translate-x-0.5 transition-transform">
                  Use Demo Credentials →
                </span>
              </button>

              {/* Faculty Demo */}
              <button
                type="button"
                onClick={() => handleDemoLogin('faculty')}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 hover:bg-primary-100 hover:border-primary-500 text-left transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    👨‍🏫
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-xs">Faculty Demo • Dr. Ramesh Sharma</p>
                    <p className="text-[11px] text-primary-700 font-mono">Email: ramesh.sharma@sriindu.ac.in</p>
                    <p className="text-[10px] text-slate-500 font-mono">Password: campus2026</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-primary-600 group-hover:translate-x-0.5 transition-transform">
                  Use Demo Credentials →
                </span>
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3 text-xs text-slate-500">
            <p>
              Don't have an account?{' '}
              <Link to="/auth/student-faculty?mode=signup" className="text-primary-600 font-bold hover:underline">
                Create student account
              </Link>
            </p>
            <Link to="/auth/portal" className="text-slate-400 hover:text-slate-600">
              ← Switch to Driver or Dispatcher portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

