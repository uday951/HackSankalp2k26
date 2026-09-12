export interface KnownDriverInfo {
  id: string
  name: string
  phone: string
  avatar: string
  rating: number
  totalTrips: number
  vehicleId: string
  vehicleName: string
  vehicleRegistration: string
  vehicleType: string
  licenseNumber: string
}

export const KNOWN_DRIVERS: Record<string, KnownDriverInfo> = {
  d1: { id: 'd1', name: 'Rahul Kumar', phone: '+91 99887 76655', avatar: 'RK', rating: 4.8, totalTrips: 312, vehicleId: 'v1', vehicleName: 'Campus Shuttle Bus 01 (V1)', vehicleRegistration: 'TS 09 AB 1234', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2018-004521' },
  d2: { id: 'd2', name: 'Suresh Babu', phone: '+91 88776 65544', avatar: 'SB', rating: 4.6, totalTrips: 245, vehicleId: 'v2', vehicleName: 'Campus Van 07', vehicleRegistration: 'TS 09 CD 5678', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-005612' },
  d3: { id: 'd3', name: 'Ravi Kumar', phone: '+91 77665 54433', avatar: 'RK', rating: 4.9, totalTrips: 428, vehicleId: 'v3', vehicleName: 'Campus Bus 03', vehicleRegistration: 'TS 09 EF 9012', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-003489' },
  d4: { id: 'd4', name: 'Mahesh Reddy', phone: '+91 66554 43322', avatar: 'MR', rating: 4.7, totalTrips: 189, vehicleId: 'v4', vehicleName: 'Campus Van 15', vehicleRegistration: 'TS 09 GH 3456', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2020-006734' },
  d5: { id: 'd5', name: 'Venkat Rao', phone: '+91 55443 32211', avatar: 'VR', rating: 4.5, totalTrips: 156, vehicleId: 'v5', vehicleName: 'Campus Van 09', vehicleRegistration: 'TS 09 IJ 7890', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2018-002345' },
  d6: { id: 'd6', name: 'Kiran Babu', phone: '+91 44332 21100', avatar: 'KB', rating: 4.8, totalTrips: 267, vehicleId: 'v6', vehicleName: 'Campus Van 21', vehicleRegistration: 'TS 09 KL 1357', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-007890' },
  d7: { id: 'd7', name: 'Satish Kumar', phone: '+91 33221 10099', avatar: 'SK', rating: 4.6, totalTrips: 198, vehicleId: 'v7', vehicleName: 'Campus Auto 04', vehicleRegistration: 'TS 09 MN 2468', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-001278' },
  d8: { id: 'd8', name: 'Prasad Naidu', phone: '+91 22110 09988', avatar: 'PN', rating: 4.4, totalTrips: 134, vehicleId: 'v8', vehicleName: 'Campus Van 18', vehicleRegistration: 'TS 09 OP 3691', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2018-009845' },
  d9: { id: 'd9', name: 'Gopal Krishna', phone: '+91 91122 33445', avatar: 'GK', rating: 4.7, totalTrips: 210, vehicleId: 'v9', vehicleName: 'Electric Shuttle 02', vehicleRegistration: 'TS 09 QR 4820', vehicleType: 'Electric Shuttle', licenseNumber: 'TS-09-2020-004412' },
  d10: { id: 'd10', name: 'Anil Varma', phone: '+91 82233 44556', avatar: 'AV', rating: 4.8, totalTrips: 280, vehicleId: 'v10', vehicleName: 'Campus Express Bus 05', vehicleRegistration: 'TS 09 ST 5931', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-008923' },
  d11: { id: 'd11', name: 'Srinivas Reddy', phone: '+91 73344 55667', avatar: 'SR', rating: 4.5, totalTrips: 172, vehicleId: 'v11', vehicleName: 'Campus Van 11', vehicleRegistration: 'TS 09 UV 6042', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-003319' },
  d12: { id: 'd12', name: 'Mohammed Ali', phone: '+91 64455 66778', avatar: 'MA', rating: 4.9, totalTrips: 390, vehicleId: 'v12', vehicleName: 'Campus Shuttle Bus 06', vehicleRegistration: 'TS 09 WX 7153', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2016-006745' },
  d13: { id: 'd13', name: 'Ramesh Yadav', phone: '+91 55566 77889', avatar: 'RY', rating: 4.6, totalTrips: 165, vehicleId: 'v13', vehicleName: 'Campus Auto 08', vehicleRegistration: 'TS 09 YZ 8264', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-005531' },
  d14: { id: 'd14', name: 'Manoj Kumar', phone: '+91 46677 88990', avatar: 'MK', rating: 4.7, totalTrips: 225, vehicleId: 'v14', vehicleName: 'Campus Van 25', vehicleRegistration: 'TS 09 AA 9375', vehicleType: 'Campus Van', licenseNumber: 'TS-09-2018-007722' },
  d15: { id: 'd15', name: 'Vijay Sharma', phone: '+91 37788 99001', avatar: 'VS', rating: 4.8, totalTrips: 340, vehicleId: 'v15', vehicleName: 'Electric Shuttle 09', vehicleRegistration: 'TS 09 BB 1486', vehicleType: 'Electric Shuttle', licenseNumber: 'TS-09-2019-008891' },
  d16: { id: 'd16', name: 'Krishna Murthy', phone: '+91 28899 00112', avatar: 'KM', rating: 4.5, totalTrips: 195, vehicleId: 'v16', vehicleName: 'Campus Bus 14', vehicleRegistration: 'TS 09 CC 2597', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-002244' },
  d17: { id: 'd17', name: 'Baskar Rao', phone: '+91 19900 11223', avatar: 'BR', rating: 4.6, totalTrips: 180, vehicleId: 'v17', vehicleName: 'Campus Van 30', vehicleRegistration: 'TS 09 DD 3608', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2020-001188' },
  d18: { id: 'd18', name: 'Jagdish Chandra', phone: '+91 90011 22334', avatar: 'JC', rating: 4.4, totalTrips: 140, vehicleId: 'v18', vehicleName: 'Campus Van 33', vehicleRegistration: 'TS 09 EE 4719', vehicleType: 'Campus Van', licenseNumber: 'TS-09-2018-006655' },
  d19: { id: 'd19', name: 'Shankar Naik', phone: '+91 81122 33445', avatar: 'SN', rating: 4.8, totalTrips: 305, vehicleId: 'v19', vehicleName: 'Campus Shuttle Bus 08', vehicleRegistration: 'TS 09 FF 5820', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2016-009933' },
  d20: { id: 'd20', name: 'Praveen Kumar', phone: '+91 72233 44556', avatar: 'PK', rating: 4.7, totalTrips: 260, vehicleId: 'v20', vehicleName: 'Campus Auto 12', vehicleRegistration: 'TS 09 GG 6931', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-004477' },
}

function getDeterministicDriver(key: string): KnownDriverInfo {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  const idx = (Math.abs(hash) % 20) + 1
  return KNOWN_DRIVERS[`d${idx}`] || KNOWN_DRIVERS['d1']
}

export function resolveDriverInfo(driverId?: string, fallbackName?: string, liveDrivers?: any[]): KnownDriverInfo {
  if (driverId && liveDrivers && liveDrivers.length > 0) {
    const matched = liveDrivers.find((d) => d.id === driverId || d._id === driverId)
    if (matched && matched.name && !matched.name.toLowerCase().includes('campus driver')) {
      return {
        id: matched.id || driverId,
        name: matched.name,
        phone: matched.phone || '+91 99887 76655',
        avatar: matched.avatar || (matched.name ? matched.name.slice(0, 2).toUpperCase() : 'D'),
        rating: matched.rating || 4.8,
        totalTrips: matched.totalTrips || 150,
        vehicleId: matched.vehicleId || 'v1',
        vehicleName: matched.vehicleType || 'Campus Shuttle',
        vehicleRegistration: matched.vehicleRegistration || 'TS 09 AB 1234',
        vehicleType: matched.vehicleType || 'Shuttle',
        licenseNumber: matched.licenseNo || 'TS-09-2020-001234',
      }
    }
  }

  if (driverId) {
    if (KNOWN_DRIVERS[driverId]) {
      return KNOWN_DRIVERS[driverId]
    }
    const norm = driverId.toLowerCase().replace(/^driver-?/, 'd')
    if (KNOWN_DRIVERS[norm]) {
      return KNOWN_DRIVERS[norm]
    }
    const numMatch = driverId.match(/\d+/)
    if (numMatch) {
      const num = parseInt(numMatch[0], 10)
      const driverKey = `d${((num - 1) % 20) + 1}`
      if (KNOWN_DRIVERS[driverKey]) {
        return KNOWN_DRIVERS[driverKey]
      }
    }
  }

  if (fallbackName && !fallbackName.toLowerCase().includes('campus driver') && fallbackName.trim().length > 2) {
    return {
      id: driverId || 'd1',
      name: fallbackName,
      phone: '+91 99887 76655',
      avatar: fallbackName.slice(0, 2).toUpperCase(),
      rating: 4.8,
      totalTrips: 150,
      vehicleId: 'v1',
      vehicleName: 'Campus Shuttle',
      vehicleRegistration: 'TS 09 AB 1234',
      vehicleType: 'Shuttle',
      licenseNumber: 'TS-09-2020-001234',
    }
  }

  if (driverId) {
    return getDeterministicDriver(driverId)
  }

  return KNOWN_DRIVERS['d1']
}

