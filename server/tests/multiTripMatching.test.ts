import { describe, it, expect } from 'vitest'
import { matchingService } from '../services/matchingService.js'
import { tripGroupingService } from '../services/tripGroupingService.js'

describe('Intelligent Multi-Trip Grouping & Separation Engine', () => {
  // Common locations
  const LB_NAGAR = { name: 'LB Nagar Circle', lat: 17.3457, lng: 78.5522 }
  const VANASTHALIPURAM = { name: 'Vanasthalipuram Complex', lat: 17.3312, lng: 78.5724 }
  const HASTHINAPURAM = { name: 'Hasthinapuram North', lat: 17.3180, lng: 78.5600 }
  const SRI_INDU_CAMPUS = { name: 'Sri Indu College of Engineering & Technology', lat: 17.2063, lng: 78.6015 }
  
  // Opposite / distant locations
  const KUKATPALLY = { name: 'Kukatpally Housing Board', lat: 17.4938, lng: 78.3995 }
  const HITEC_CITY = { name: 'HITEC City Cyber Towers', lat: 17.4504, lng: 78.3808 }
  const SECUNDERABAD = { name: 'Secunderabad Junction', lat: 17.4399, lng: 78.4983 }

  describe('1. Trajectory Direction Alignment (Vector Cosine Similarity)', () => {
    it('calculates high positive similarity (> 0.85) for aligned corridors', () => {
      // LB Nagar -> Sri Indu (South-East) vs Vanasthalipuram -> Sri Indu (South-East)
      const sim = matchingService.calculateDirectionSimilarity(
        LB_NAGAR.lat, LB_NAGAR.lng, SRI_INDU_CAMPUS.lat, SRI_INDU_CAMPUS.lng,
        VANASTHALIPURAM.lat, VANASTHALIPURAM.lng, SRI_INDU_CAMPUS.lat, SRI_INDU_CAMPUS.lng
      )
      expect(sim).toBeGreaterThan(0.85)
    })

    it('calculates negative similarity (< -0.5) for opposing directions', () => {
      // LB Nagar -> Sri Indu (South) vs Sri Indu -> Secunderabad (North)
      const sim = matchingService.calculateDirectionSimilarity(
        LB_NAGAR.lat, LB_NAGAR.lng, SRI_INDU_CAMPUS.lat, SRI_INDU_CAMPUS.lng,
        SRI_INDU_CAMPUS.lat, SRI_INDU_CAMPUS.lng, SECUNDERABAD.lat, SECUNDERABAD.lng
      )
      expect(sim).toBeLessThan(-0.5)
    })
  })

  describe('2. Pairwise Booking Compatibility', () => {
    it('marks two bookings in same corridor heading to same campus as compatible', () => {
      const b1: any = {
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
        genderPreference: 'ANYONE',
      }
      const b2: any = {
        pickupLat: VANASTHALIPURAM.lat,
        pickupLng: VANASTHALIPURAM.lng,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:35',
        genderPreference: 'ANYONE',
      }
      const compatible = tripGroupingService.areBookingsCompatible(b1, b2)
      expect(compatible).toBe(true)
    })

    it('rejects bookings heading in opposite directions (e.g. South Campus vs North Secunderabad)', () => {
      const bSouth: any = {
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
      }
      const bNorth: any = {
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destinationLat: SECUNDERABAD.lat,
        destinationLng: SECUNDERABAD.lng,
        seats: 1,
        time: '08:30',
      }
      const compatible = tripGroupingService.areBookingsCompatible(bSouth, bNorth)
      expect(compatible).toBe(false)
    })

    it('strictly isolates female-only bookings from male passengers', () => {
      const femaleBooking: any = {
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
        genderPreference: 'FEMALE_ONLY',
        passengerGender: 'female',
      }
      const maleBooking: any = {
        pickupLat: VANASTHALIPURAM.lat,
        pickupLng: VANASTHALIPURAM.lng,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
        genderPreference: 'ANYONE',
        passengerGender: 'male',
      }
      const compatible = tripGroupingService.areBookingsCompatible(femaleBooking, maleBooking)
      expect(compatible).toBe(false)
    })
  })

  describe('3. Multi-Passenger Grouping & Automatic Trip Splitting', () => {
    it('Case A: Groups 3 compatible passengers along the same corridor into 1 trip group', async () => {
      const p1: any = {
        id: 'bk-1',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
      }
      const p2: any = {
        id: 'bk-2',
        pickup: VANASTHALIPURAM.name,
        pickupLat: VANASTHALIPURAM.lat,
        pickupLng: VANASTHALIPURAM.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 2,
        time: '08:35',
      }
      const p3: any = {
        id: 'bk-3',
        pickup: HASTHINAPURAM.name,
        pickupLat: HASTHINAPURAM.lat,
        pickupLng: HASTHINAPURAM.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:40',
      }

      const groups = await tripGroupingService.groupPendingBookings([p1, p2, p3])
      expect(groups.length).toBe(1)
      expect(groups[0].bookings.length).toBe(3)
      expect(groups[0].totalSeats).toBe(4)
      expect(groups[0].driver).toBeDefined()
      expect(groups[0].vehicle).toBeDefined()
    })

    it('Case B: Splits 3 incompatible passengers into 3 distinct trip groups with distinct drivers & vehicles', async () => {
      const pSouth: any = {
        id: 'bk-south',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
      }
      const pNorth: any = {
        id: 'bk-north',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SECUNDERABAD.name,
        destinationLat: SECUNDERABAD.lat,
        destinationLng: SECUNDERABAD.lng,
        seats: 1,
        time: '08:30',
      }
      const pWest: any = {
        id: 'bk-west',
        pickup: KUKATPALLY.name,
        pickupLat: KUKATPALLY.lat,
        pickupLng: KUKATPALLY.lng,
        destination: HITEC_CITY.name,
        destinationLat: HITEC_CITY.lat,
        destinationLng: HITEC_CITY.lng,
        seats: 1,
        time: '08:30',
      }

      const groups = await tripGroupingService.groupPendingBookings([pSouth, pNorth, pWest])
      expect(groups.length).toBe(3)
      expect(groups[0].bookings.length).toBe(1)
      expect(groups[1].bookings.length).toBe(1)
      expect(groups[2].bookings.length).toBe(1)

      // Ensure drivers and vehicles are distinct for each trip
      const drivers = groups.map((g) => g.driver.id)
      const vehicles = groups.map((g) => g.vehicle.id)
      expect(new Set(drivers).size).toBe(3)
      expect(new Set(vehicles).size).toBe(3)
    })

    it('Case C: 2 compatible passengers + 1 incompatible passenger -> 2 distinct trips', async () => {
      const p1Campus: any = {
        id: 'bk-c1',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:30',
      }
      const p2Campus: any = {
        id: 'bk-c2',
        pickup: VANASTHALIPURAM.name,
        pickupLat: VANASTHALIPURAM.lat,
        pickupLng: VANASTHALIPURAM.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 1,
        time: '08:35',
      }
      const p3Opposite: any = {
        id: 'bk-opp',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SECUNDERABAD.name,
        destinationLat: SECUNDERABAD.lat,
        destinationLng: SECUNDERABAD.lng,
        seats: 1,
        time: '08:30',
      }

      const groups = await tripGroupingService.groupPendingBookings([p1Campus, p2Campus, p3Opposite])
      expect(groups.length).toBe(2)
      
      const twoPaxGroup = groups.find((g) => g.bookings.length === 2)
      const onePaxGroup = groups.find((g) => g.bookings.length === 1)
      expect(twoPaxGroup).toBeDefined()
      expect(onePaxGroup).toBeDefined()
      expect(onePaxGroup?.bookings[0].id).toBe('bk-opp')

      // Distinct drivers for the 2 trips
      expect(twoPaxGroup?.driver.id).not.toBe(onePaxGroup?.driver.id)
    })

    it('Case D: Vehicle capacity constraint strictly respected (does not exceed 6 seats)', async () => {
      const pHeavy1: any = {
        id: 'bk-h1',
        pickup: LB_NAGAR.name,
        pickupLat: LB_NAGAR.lat,
        pickupLng: LB_NAGAR.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 4,
        time: '08:30',
      }
      const pHeavy2: any = {
        id: 'bk-h2',
        pickup: VANASTHALIPURAM.name,
        pickupLat: VANASTHALIPURAM.lat,
        pickupLng: VANASTHALIPURAM.lng,
        destination: SRI_INDU_CAMPUS.name,
        destinationLat: SRI_INDU_CAMPUS.lat,
        destinationLng: SRI_INDU_CAMPUS.lng,
        seats: 4, // 4 + 4 = 8 > 6 max capacity
        time: '08:30',
      }

      const groups = await tripGroupingService.groupPendingBookings([pHeavy1, pHeavy2], 6)
      // Must split into 2 trips because combined 8 seats exceeds vehicle capacity 6
      expect(groups.length).toBe(2)
      expect(groups[0].totalSeats).toBe(4)
      expect(groups[1].totalSeats).toBe(4)
      expect(groups[0].driver.id).not.toBe(groups[1].driver.id)
    })
  })
})
