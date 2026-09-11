import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ShieldAlert, Volume2, VolumeX, CheckCircle, MapPin, ExternalLink } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { sosAlarmPlayer, isDispatcherPortal } from '../../utils/alarmSound'
import toast from 'react-hot-toast'

export const EmergencyAlarmBanner: React.FC = () => {
  const location = useLocation()
  const role = useAppStore((s) => s.role)
  const currentUser = useAppStore((s) => s.currentUser)
  const safetyEvents = useAppStore((s) => s.safetyEvents)
  const acknowledgeSafetyEvent = useAppStore((s) => s.acknowledgeSafetyEvent)
  const [isMuted, setIsMuted] = useState(false)
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set())

  // Strictly check if current view is the Dispatcher Portal
  const isDispatcher =
    role === 'admin' ||
    currentUser?.role?.toLowerCase() === 'admin' ||
    currentUser?.role?.toLowerCase() === 'dispatcher' ||
    location.pathname.startsWith('/admin') ||
    isDispatcherPortal()

  // Ensure audio is stopped on all other portals (student, faculty, driver)
  useEffect(() => {
    if (!isDispatcher) {
      sosAlarmPlayer.stop()
    }
  }, [isDispatcher])

  // Find active, unacknowledged SOS events
  const activeSosEvents = safetyEvents.filter((e) => {
    const isSos = e.eventType === 'SOS' || e.eventType === 'STUDENT_SOS_TRIGGERED' || e.eventType === 'DRIVER_SOS_TRIGGERED' || (e.type && e.type.includes('SOS'))
    const isUnresolved = !e.resolved && e.status !== 'RESOLVED'
    const isLocalAcknowledged = acknowledgedIds.has(e.id)
    return isSos && isUnresolved && !isLocalAcknowledged && e.status !== 'ACKNOWLEDGED'
  })

  const currentSos = activeSosEvents[0]

  useEffect(() => {
    if (isDispatcher && currentSos && !isMuted) {
      sosAlarmPlayer.play().catch(() => {})
    } else {
      sosAlarmPlayer.stop()
    }

    return () => {
      sosAlarmPlayer.stop()
    }
  }, [isDispatcher, currentSos, isMuted])

  // If not in dispatcher portal or no active SOS, do not render banner
  if (!isDispatcher || !currentSos) return null

  const handleAcknowledge = async () => {
    try {
      sosAlarmPlayer.stop()
      setAcknowledgedIds((prev) => new Set(prev).add(currentSos.id))
      await acknowledgeSafetyEvent(currentSos.id)
      toast.success('Emergency SOS Acknowledged. Loud alarm silenced.', { icon: '🛡️' })
    } catch {
      sosAlarmPlayer.stop()
      setAcknowledgedIds((prev) => new Set(prev).add(currentSos.id))
      toast('Loud alarm silenced locally.', { icon: '🔕' })
    }
  }

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false)
      sosAlarmPlayer.play().catch(() => {})
    } else {
      setIsMuted(true)
      sosAlarmPlayer.stop()
    }
  }

  const lat = currentSos.lat
  const lng = currentSos.lng
  const mapUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-2xl border-b-4 border-red-900 animate-pulse">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Alert Description */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 animate-bounce">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-black/40 text-[10px] font-black uppercase tracking-wider text-rose-200">
                LOUD SOS ALARM ACTIVE
              </span>
              <span className="text-xs font-bold text-white truncate">
                {currentSos.userName || 'Passenger / Commuter'} ({currentSos.userRole || 'STUDENT'})
              </span>
            </div>
            <p className="text-xs text-rose-100 font-medium truncate mt-0.5">
              {currentSos.routeName ? `Trip: ${currentSos.routeName}` : 'Emergency alert beacon triggered in campus zone'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Map</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <button
            onClick={handleToggleMute}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title={isMuted ? 'Unmute Alarm' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-amber-200" /> : <Volume2 className="w-4 h-4 animate-pulse text-white" />}
            <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            onClick={handleAcknowledge}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-red-700 hover:text-red-800 text-xs font-black shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>ACKNOWLEDGE SOS</span>
          </button>
        </div>
      </div>
    </div>
  )
}