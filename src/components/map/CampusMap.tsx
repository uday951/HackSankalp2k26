import React, { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Locate, Navigation, AlertTriangle, Crosshair } from 'lucide-react'
import toast from 'react-hot-toast'
import { CampusMapProps, MapPoint } from './types'
import {
  createPickupIcon,
  createDestinationIcon,
  createVehicleIcon,
  createRouteStopIcon,
  createLocationPickerIcon,
  createUserLocationIcon,
} from './markers'
import { routingService } from '../../services/routing/routingService'

function findNearestCoordinateIndex(coords: [number, number][], target: [number, number]): number {
  let minDistance = Infinity
  let nearestIndex = 0
  for (let i = 0; i < coords.length; i++) {
    const dLat = coords[i][0] - target[0]
    const dLng = coords[i][1] - target[1]
    const distSq = dLat * dLat + dLng * dLng
    if (distSq < minDistance) {
      minDistance = distSq
      nearestIndex = i
    }
  }
  return nearestIndex
}

export default function CampusMap({
  center = [17.392, 78.482],
  zoom = 14,
  points = [],
  routeCoordinates = [],
  multiRoutes = [],
  selectedRouteId,
  onRouteSelect,
  vehicles = [],
  vehicleLat,
  vehicleLng,
  vehicleHeading = 0,
  cameraMode = 'OVERVIEW',
  onCameraModeChange,
  stops = [],
  splitRoute,
  showRecenterButton = false,
  onRecenter,
  interactive = true,
  height = 'h-64',
  className = '',
  selectable = false,
  selectedCoordinate = null,
  onLocationSelect,
  onRouteCalculated,
  enableCurrentLocation = false,
  alertMode = false,
  showRouteInfo = true,
  autoFit = true,
  origin,
  highlightStopStudentId,
  rideBookedSeats,
  rideCapacity,
}: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const routeCompletedLayerRef = useRef<L.Polyline | null>(null)
  const routeRemainingLayerRef = useRef<L.Polyline | null>(null)
  const multiRoutesLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const singleVehicleMarkerRef = useRef<L.Marker | null>(null)
  const selectedMarkerRef = useRef<L.Marker | null>(null)
  const userLocationMarkerRef = useRef<L.Marker | null>(null)

  const [activeGeometry, setActiveGeometry] = useState<[number, number][]>(routeCoordinates)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [isRouting, setIsRouting] = useState(false)
  const [routingError, setRoutingError] = useState<string | null>(null)
  const [tileError, setTileError] = useState(false)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null)

  // Keep latest callback ref to avoid re-triggering effects
  const onRouteCalculatedRef = useRef(onRouteCalculated)
  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated
  }, [onRouteCalculated])

  // Serialized keys to detect genuine coordinate changes
  const waypoints = points.filter((p) => p.type !== 'vehicle' && p.type !== 'userLocation')
  const waypointsKey = waypoints
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join('|')
  const pointsHash = points
    .map((p) => `${p.type}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.label}`)
    .join(';')
  const stopsHash = (stops || [])
    .map((s) => `${s.id}:${s.status}:${s.sequence || 0}`)
    .join(';')

  const lastCalculatedKeyRef = useRef<string>('')
  const lastFitBoundsKeyRef = useRef<string>('')
  const lastMarkersKeyRef = useRef<string>('')

  // ---------------------------------------------------------------------------
  // 1. Initialize Leaflet Map Instance
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      attributionControl: true,
    })

    // OpenStreetMap standard tile layer
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | OSRM',
    })

    tileLayer.on('tileerror', () => {
      setTileError(true)
    })

    tileLayer.addTo(map)

    const multiRoutesGroup = L.layerGroup().addTo(map)
    multiRoutesLayerGroupRef.current = multiRoutesGroup

    const markersGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = markersGroup
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
      vehicleMarkersRef.current.clear()
      singleVehicleMarkerRef.current = null
      multiRoutesLayerGroupRef.current = null
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 2. User Camera Interaction & Drag Detection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const handleUserDrag = () => {
      if (onCameraModeChange) {
        onCameraModeChange('FREE_EXPLORE')
      }
    }

    map.on('dragstart', handleUserDrag)
    map.on('zoomstart', handleUserDrag)

    return () => {
      map.off('dragstart', handleUserDrag)
      map.off('zoomstart', handleUserDrag)
    }
  }, [onCameraModeChange])

  // ---------------------------------------------------------------------------
  // 3. Map Click Listener for Interactive Location Picking
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectable) return

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (onLocationSelect) {
        onLocationSelect(lat, lng)
      }
    }

    map.on('click', handleMapClick)
    return () => {
      map.off('click', handleMapClick)
    }
  }, [selectable, onLocationSelect])

  // ---------------------------------------------------------------------------
  // 4. Render Selected Coordinate Marker
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (selectedMarkerRef.current) {
      map.removeLayer(selectedMarkerRef.current)
      selectedMarkerRef.current = null
    }

    if (selectedCoordinate) {
      const [lat, lng] = selectedCoordinate
      const marker = L.marker([lat, lng], {
        icon: createLocationPickerIcon(),
        zIndexOffset: 800,
      }).addTo(map)

      marker.bindPopup(`<strong>Selected Pin</strong><br/><span style="font-size:11px;color:#64748b;">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`).openPopup()
      selectedMarkerRef.current = marker
    }
  }, [selectedCoordinate])

  // ---------------------------------------------------------------------------
  // 5. Geolocation: "Use My Current Location"
  // ---------------------------------------------------------------------------
  const handleCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserCoords([latitude, longitude])

        const map = mapInstanceRef.current
        if (map) {
          map.setView([latitude, longitude], 16, { animate: true })

          if (userLocationMarkerRef.current) {
            userLocationMarkerRef.current.setLatLng([latitude, longitude])
          } else {
            const marker = L.marker([latitude, longitude], {
              icon: createUserLocationIcon(),
              zIndexOffset: 900,
            }).addTo(map)
            marker.bindPopup('<strong>Your Current Location</strong>')
            userLocationMarkerRef.current = marker
          }
        }

        if (onLocationSelect) {
          onLocationSelect(latitude, longitude)
        }
        toast.success('Centered on your current location!')
      },
      (err) => {
        console.warn('Geolocation error:', err.message)
        toast.error('Location permission denied. You can select a campus location manually.', { duration: 4000 })
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }, [onLocationSelect])

  // ---------------------------------------------------------------------------
  // 6. Calculate Real Road Route using OSRM (if coordinates not passed)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false

    // If explicit road coordinates passed, use directly
    if (routeCoordinates && routeCoordinates.length >= 2) {
      setActiveGeometry(routeCoordinates)
      setIsRouting(false)
      setRoutingError(null)
      return
    }

    if (waypoints.length < 2) {
      setActiveGeometry([])
      setRouteInfo(null)
      setIsRouting(false)
      lastCalculatedKeyRef.current = ''
      return
    }

    // Guard against redundant route calculation if waypoints haven't changed
    if (waypointsKey === lastCalculatedKeyRef.current) {
      return
    }

    async function computeRoute() {
      setIsRouting(true)
      setRoutingError(null)
      try {
        const res = await routingService.getRoute(waypoints.map((p) => ({ lat: p.lat, lng: p.lng })))
        if (!isCancelled) {
          lastCalculatedKeyRef.current = waypointsKey
          if (res.geometry && res.geometry.length > 0) {
            setActiveGeometry(res.geometry)
            const dist = routingService.formatDistance(res.distanceMeters)
            const dur = routingService.formatDuration(res.durationSeconds)
            setRouteInfo({ distance: dist, duration: dur })
            if (onRouteCalculatedRef.current) {
              onRouteCalculatedRef.current(res.distanceMeters, res.durationSeconds)
            }
          } else {
            setRoutingError('No road route found.')
          }
        }
      } catch (e: any) {
        if (!isCancelled) {
          console.warn('[CampusMap] Route calculation error:', e.message)
          setRoutingError('Route service temporarily unavailable. Using campus corridor.')
        }
      } finally {
        if (!isCancelled) setIsRouting(false)
      }
    }

    computeRoute()
    return () => {
      isCancelled = true
    }
  }, [waypointsKey, routeCoordinates])

  // ---------------------------------------------------------------------------
  // 7. Render Split Route Polyline (Completed vs Remaining) & Auto-Fit
  // ---------------------------------------------------------------------------
  const singleVLat = vehicleLat || points.find((p) => p.type === 'vehicle')?.lat
  const singleVLng = vehicleLng || points.find((p) => p.type === 'vehicle')?.lng

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (routeCompletedLayerRef.current) {
      map.removeLayer(routeCompletedLayerRef.current)
      routeCompletedLayerRef.current = null
    }
    if (routeRemainingLayerRef.current) {
      map.removeLayer(routeRemainingLayerRef.current)
      routeRemainingLayerRef.current = null
    }

    let completedGeometry: [number, number][] = []
    let remainingGeometry: [number, number][] = []

    if (splitRoute) {
      completedGeometry = splitRoute.completed || []
      remainingGeometry = splitRoute.remaining || []
    } else if (activeGeometry && activeGeometry.length >= 2) {
      if (singleVLat !== undefined && singleVLng !== undefined) {
        const nearestIdx = findNearestCoordinateIndex(activeGeometry, [singleVLat, singleVLng])
        completedGeometry = activeGeometry.slice(0, nearestIdx + 1)
        remainingGeometry = [[singleVLat, singleVLng], ...activeGeometry.slice(nearestIdx + 1)]
      } else {
        remainingGeometry = activeGeometry
      }
    }

    // 7a. Completed Route: Subdued slate dashed polyline
    if (completedGeometry.length >= 2) {
      const compPoly = L.polyline(completedGeometry, {
        color: '#94a3b8',
        weight: 4,
        dashArray: '4, 8',
        opacity: 0.75,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
      routeCompletedLayerRef.current = compPoly
    }

    // 7b. Remaining Route: Prominent vibrant blue polyline
    if (remainingGeometry.length >= 2) {
      const remPoly = L.polyline(remainingGeometry, {
        color: alertMode ? '#ef4444' : '#0284c7',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
      routeRemainingLayerRef.current = remPoly
    }

    // 7c. Camera OVERVIEW auto-fit
    const fitKey = activeGeometry.length >= 2
      ? `geom:${activeGeometry.length}:${activeGeometry[0]?.[0]}:${activeGeometry[activeGeometry.length - 1]?.[0]}`
      : `pts:${pointsHash}`

    if (autoFit && cameraMode === 'OVERVIEW' && lastFitBoundsKeyRef.current !== fitKey) {
      lastFitBoundsKeyRef.current = fitKey
      if (activeGeometry.length >= 2) {
        const bounds = L.latLngBounds(activeGeometry)
        if (singleVLat && singleVLng) bounds.extend([singleVLat, singleVLng])
        try {
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
        } catch {}
      } else if (points.length > 0) {
        const validPoints = points.filter((p) => p.lat && p.lng)
        if (validPoints.length > 0) {
          const bounds = L.latLngBounds(validPoints.map((p) => [p.lat, p.lng]))
          try {
            map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
          } catch {}
        }
      }
    }
  }, [activeGeometry, splitRoute, singleVLat, singleVLng, alertMode, autoFit, cameraMode, pointsHash])

  // ---------------------------------------------------------------------------
  // 7d. Render Multi-Routes for Fleet Dispatch Map
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    const group = multiRoutesLayerGroupRef.current
    if (!map || !group) return

    group.clearLayers()

    if (multiRoutes && multiRoutes.length > 0) {
      const allRouteBounds = L.latLngBounds([])

      multiRoutes.forEach((mr) => {
        const isSelected = mr.id === selectedRouteId || mr.isSelected
        const routeColor = mr.color || '#2563EB'

        // Draw the route polyline
        if (mr.coordinates && mr.coordinates.length >= 2) {
          const poly = L.polyline(mr.coordinates, {
            color: routeColor,
            weight: isSelected ? 6 : 4,
            opacity: isSelected ? 1.0 : 0.75,
            lineCap: 'round',
            lineJoin: 'round',
          })

          poly.bindPopup(`
            <div style="font-family: sans-serif; min-width: 140px;">
              <strong style="color: #0f172a; font-size: 13px;">${mr.name}</strong>
              <br/>
              <span style="font-size: 11px; color: ${routeColor}; font-weight: 600;">
                ${mr.status || 'Active Route'}
              </span>
              <div style="font-size: 11px; color: #64748b; margin-top: 3px;">
                ${mr.coordinates.length} waypoints
              </div>
            </div>
          `)

          poly.on('click', () => {
            if (onRouteSelect) onRouteSelect(mr.id)
          })

          group.addLayer(poly)
          if (isSelected) poly.bringToFront()
          allRouteBounds.extend(poly.getBounds())
        }

        // Draw per-stop markers for each route (pickup + dropoff per passenger)
        if (mr.stops && mr.stops.length > 0) {
          mr.stops.forEach((stop: any, idx: number) => {
            const lat = stop.latitude ?? stop.lat
            const lng = stop.longitude ?? stop.lng
            if (!lat || !lng) return

            const isDropoff = stop.type === 'DROPOFF' || stop.type === 'dropoff' || stop.stopType === 'DROPOFF'
            const stopName = stop.name || stop.stopName || (isDropoff ? 'Dropoff' : 'Pickup')

            const icon = L.divIcon({
              className: '',
              html: isDropoff
                ? `<div style="
                    width: 26px; height: 26px;
                    background: ${routeColor};
                    border: 2.5px solid white;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-size: 13px; font-weight: 700;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                  ">★</div>`
                : `<div style="
                    width: 22px; height: 22px;
                    background: white;
                    border: 2.5px solid ${routeColor};
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: ${routeColor}; font-size: 10px; font-weight: 700;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                  ">${idx + 1}</div>`,
              iconSize: isDropoff ? [26, 26] : [22, 22],
              iconAnchor: isDropoff ? [13, 13] : [11, 11],
              popupAnchor: [0, -14],
            })

            const marker = L.marker([lat, lng], { icon, zIndexOffset: isDropoff ? 900 : 800 })
            marker.bindPopup(`
              <div style="font-family: sans-serif; min-width: 130px;">
                <strong style="color: #0f172a; font-size: 12px;">${stopName}</strong>
                <div style="font-size: 10px; color: ${routeColor}; font-weight: 600; margin-top: 2px;">
                  ${isDropoff ? '🏁 Dropoff' : '📍 Pickup'} — ${mr.name}
                </div>
                ${stop.eta ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">ETA: ${stop.eta}</div>` : ''}
              </div>
            `)
            group.addLayer(marker)
            allRouteBounds.extend([lat, lng])
          })
        }
      })

      if (autoFit && cameraMode === 'OVERVIEW' && allRouteBounds.isValid()) {
        try {
          map.fitBounds(allRouteBounds, { padding: [40, 40], maxZoom: 15, animate: true })
        } catch {}
      }
    }
  }, [multiRoutes, selectedRouteId, onRouteSelect, autoFit, cameraMode])

  // ---------------------------------------------------------------------------
  // 8. Camera Controller (FOLLOW vs OVERVIEW)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (cameraMode === 'FOLLOW' && singleVLat !== undefined && singleVLng !== undefined) {
      map.panTo([singleVLat, singleVLng], { animate: true, duration: 0.8 })
      if (map.getZoom() < 15) {
        map.setZoom(16)
      }
    } else if (cameraMode === 'OVERVIEW') {
      if (activeGeometry.length >= 2) {
        const bounds = L.latLngBounds(activeGeometry)
        if (singleVLat && singleVLng) bounds.extend([singleVLat, singleVLng])
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true })
        } catch {}
      }
    }
  }, [cameraMode, singleVLat, singleVLng, activeGeometry])

  // ---------------------------------------------------------------------------
  // 9. Render Single Vehicle Marker Smoothly (Live GPS & Heading)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (singleVLat !== undefined && singleVLng !== undefined && (!vehicles || vehicles.length === 0)) {
      const vIcon = createVehicleIcon({
        name: 'Campus Shuttle',
        bookedSeats: rideBookedSeats,
        capacity: rideCapacity,
        isAlert: alertMode,
        heading: vehicleHeading || 0,
      })

      if (singleVehicleMarkerRef.current) {
        singleVehicleMarkerRef.current.setLatLng([singleVLat, singleVLng])
        singleVehicleMarkerRef.current.setIcon(vIcon)
      } else {
        const vMarker = L.marker([singleVLat, singleVLng], { icon: vIcon, zIndexOffset: 1200 }).addTo(map)
        vMarker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 150px;">
            <strong style="color: #0f172a; font-size: 13px;">Campus Shuttle</strong>
            <br/>
            <span style="font-size: 11px; color: ${alertMode ? '#ef4444' : '#0284c7'}; font-weight: 600;">
              ${alertMode ? '⚠ Route Deviation Alert' : '⚡ Live Navigation Active'}
            </span>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Real road tracking via OSRM</div>
          </div>
        `)
        singleVehicleMarkerRef.current = vMarker
      }
    } else {
      if (singleVehicleMarkerRef.current) {
        map.removeLayer(singleVehicleMarkerRef.current)
        singleVehicleMarkerRef.current = null
      }
    }
  }, [singleVLat, singleVLng, vehicleHeading, alertMode, vehicles])

  // ---------------------------------------------------------------------------
  // 10. Render Stop & Fleet Markers
  // ---------------------------------------------------------------------------
  const vehiclesKey = vehicles.map((v) => `${v.id}-${v.lat.toFixed(4)}-${v.lng.toFixed(4)}`).join(';')
  const originKey = origin ? `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${origin.name || ''}` : ''
  const currentMarkersKey = `${pointsHash}|${stopsHash}|${vehiclesKey}|${alertMode}|${originKey}|${highlightStopStudentId || ''}`

  useEffect(() => {
    const map = mapInstanceRef.current
    const group = markersLayerRef.current
    if (!map || !group) return

    if (lastMarkersKeyRef.current === currentMarkersKey) {
      return
    }
    lastMarkersKeyRef.current = currentMarkersKey

    group.clearLayers()

    // 10-origin: Dedicated Vehicle/Driver Origin Marker
    if (origin && origin.lat && origin.lng) {
      const originIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 28px; height: 28px;
          background: #059669;
          border: 2.5px solid white;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 13px; font-weight: 800;
          box-shadow: 0 3px 10px rgba(5,150,105,0.45);
        ">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
      })
      const originMarker = L.marker([origin.lat, origin.lng], { icon: originIcon, zIndexOffset: 750 })
      originMarker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 140px;">
          <strong style="color: #0f172a; font-size: 13px;">${origin.name || 'Driver Starting Point'}</strong>
          <br/>
          <span style="font-size: 11px; color: #059669; font-weight: 700;">
            📍 Vehicle Start Location
          </span>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Driver journey originated here</div>
        </div>
      `)
      group.addLayer(originMarker)
    }

    // 10a. Render RouteStops with Live Status if available
    if (stops && stops.length > 0) {
      stops.forEach((stop, idx) => {
        const isMyPickup = stop.type === 'PICKUP' && highlightStopStudentId && stop.studentId === highlightStopStudentId
        const isMyDropoff = stop.type === 'DROPOFF' && highlightStopStudentId && stop.studentId === highlightStopStudentId

        const marker = L.marker([stop.latitude, stop.longitude], {
          icon: createRouteStopIcon(stop, idx),
          zIndexOffset: isMyPickup || isMyDropoff ? 950 : 700 + idx,
        })
        marker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 140px;">
            ${isMyPickup ? '<div style="background:#eff6ff;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;margin-bottom:3px;display:inline-block;border:1px solid #bfdbfe;">📍 YOUR PICKUP</div><br/>' : ''}
            ${isMyDropoff ? '<div style="background:#ecfdf5;color:#047857;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;margin-bottom:3px;display:inline-block;border:1px solid #a7f3d0;">🏁 YOUR DESTINATION</div><br/>' : ''}
            <strong style="color: #0f172a; font-size: 13px;">${stop.name}</strong>
            <br/>
            <span style="font-size: 11px; color: ${stop.type === 'DROPOFF' ? '#16a34a' : '#0284c7'}; font-weight: 600;">
              ${stop.type === 'DROPOFF' ? '★ Destination Hub' : `Stop #${stop.sequence || idx + 1} (${stop.status})`}
            </span>
            ${stop.estimatedArrival ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">ETA: ${stop.estimatedArrival}</div>` : ''}
          </div>
        `)
        group.addLayer(marker)
      })
    } else {
      // Fallback to points
      points.forEach((pt, idx) => {
        if (pt.type === 'vehicle' || pt.type === 'userLocation' || pt.type === 'selectedLocation') return

        let icon: L.DivIcon
        if (pt.type === 'destination') {
          icon = createDestinationIcon(pt)
        } else {
          icon = createPickupIcon(pt, idx)
        }

        const marker = L.marker([pt.lat, pt.lng], { icon })
        marker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 140px;">
            <strong style="color: #0f172a; font-size: 13px;">${pt.label}</strong>
            <br/>
            <span style="font-size: 11px; color: ${pt.type === 'destination' ? '#16a34a' : '#0284c7'}; font-weight: 600;">
              ${pt.type === 'destination' ? '★ Destination Hub' : `Pickup Bay #${pt.stopOrder || idx + 1}`}
            </span>
            ${pt.time ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">ETA: ${pt.time}</div>` : ''}
          </div>
        `)
        group.addLayer(marker)
      })
    }

    // 10b. Multi-Vehicle Fleet (Dispatcher View)
    if (vehicles && vehicles.length > 0) {
      vehicles.forEach((v) => {
        const vIcon = createVehicleIcon(v)
        const vMarker = L.marker([v.lat, v.lng], { icon: vIcon, zIndexOffset: 1000 })
        vMarker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 160px;">
            <div style="font-weight: bold; color: #0f172a; font-size: 13px;">${v.name}</div>
            <div style="font-size: 11px; color: #64748b; margin: 2px 0;">Driver: ${v.driverName || 'Assigned Driver'}</div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; padding-top: 4px; border-top: 1px solid #e2e8f0;">
              <span>Capacity:</span>
              <strong style="color: #0284c7;">${v.bookedSeats} / ${v.capacity} seats</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
              <span>Status:</span>
              <span style="font-weight: 600; color: ${v.isAlert ? '#ef4444' : '#10b981'};">${v.isAlert ? '⚠ ROUTE DEVIATION' : v.status}</span>
            </div>
          </div>
        `)
        group.addLayer(vMarker)
      })
    }
  }, [currentMarkersKey, stops, points, vehicles])

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${height} ${className}`}>
      {/* Real OpenStreetMap Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Geolocation Control Button */}
      {enableCurrentLocation && (
        <button
          type="button"
          onClick={handleCurrentLocation}
          title="Use my current location"
          className="absolute bottom-4 right-4 z-10 p-2.5 bg-white text-slate-700 hover:text-primary-600 rounded-xl shadow-md border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center cursor-pointer"
        >
          <Locate className="w-4 h-4" />
        </button>
      )}

      {/* Floating Recenter Button */}
      {(showRecenterButton || cameraMode === 'FREE_EXPLORE') && (
        <button
          type="button"
          onClick={() => {
            if (onRecenter) onRecenter()
            if (onCameraModeChange) onCameraModeChange('FOLLOW')
          }}
          title="Recenter Camera"
          className="absolute bottom-4 right-14 z-10 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-lg border border-primary-500 transition-all flex items-center gap-1.5 cursor-pointer text-xs font-semibold animate-in fade-in"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Recenter</span>
        </button>
      )}

      {/* Floating OSRM Route Info Badge */}
      {showRouteInfo && routeInfo && (
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200 text-xs flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${alertMode ? 'bg-red-500' : 'bg-primary-600'} animate-pulse`} />
          <span className="font-bold text-slate-800">{routeInfo.duration}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">{routeInfo.distance}</span>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono font-medium">OSRM</span>
        </div>
      )}

      {/* Routing Loading Indicator */}
      {isRouting && (
        <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 shadow-sm flex items-center gap-1.5">
          <Navigation className="w-3 h-3 animate-spin text-primary-600" />
          <span>Calculating road route...</span>
        </div>
      )}

      {/* Routing Error Notice */}
      {routingError && !isRouting && (
        <div className="absolute top-3 right-3 z-10 bg-amber-50/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-medium text-amber-700 border border-amber-200 shadow-sm flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>{routingError}</span>
        </div>
      )}

      {/* Tile Loading Warning (Graceful Fallback) */}
      {tileError && (
        <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] text-slate-500 border border-slate-200">
          OpenStreetMap tiles cached offline
        </div>
      )}
    </div>
  )
}
export { CampusMap }
