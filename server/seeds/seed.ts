import bcrypt from 'bcryptjs'
import { UserModel } from '../models/User.js'
import { VehicleModel } from '../models/Vehicle.js'
import { RideModel } from '../models/Ride.js'
import { BookingModel } from '../models/Booking.js'
import { SafetyEventModel } from '../models/SafetyEvent.js'
import { NotificationModel } from '../models/Notification.js'
import { PricingConfigModel } from '../models/PricingConfig.js'
import { RideFareModel } from '../models/RideFare.js'
import { PricingEventModel } from '../models/PricingEvent.js'
import { AuditLogModel } from '../models/AuditLog.js'
import { RideRequestModel } from '../models/RideRequest.js'
import { RatingModel } from '../models/Rating.js'
import { EmergencyContactModel } from '../models/EmergencyContact.js'
import { connectDatabase } from '../config/database.js'

// =============================================================================
// 10 Students Seed Data (All with verified academic institution domains)
// =============================================================================
const STUDENTS_SEED = [
  { id: 's1', name: 'Uday Kiran', email: 'uday.kiran@sriindu.ac.in', studentId: '21IND0501', rollNumber: '21IND0501', collegeName: 'Sri Indu College of Engineering & Technology', department: 'Computer Science', year: 3, phone: '+91 98765 43210', avatar: 'UK', rating: 4.9, totalRides: 38, isVerified: true, role: 'STUDENT', gender: 'Male' },
  { id: 's2', name: 'Arjun Rao', email: 'arjun.rao@iith.ac.in', studentId: 'IITH2022015', rollNumber: 'EE22BTECH11015', collegeName: 'IIT Hyderabad', department: 'Electrical Engg', year: 2, phone: '+91 87654 32109', avatar: 'AR', rating: 4.7, totalRides: 22, isVerified: true, role: 'STUDENT', gender: 'Male' },
  { id: 's3', name: 'Priya Sharma', email: 'priya.sharma@nitw.ac.in', studentId: 'NITW2021034', rollNumber: 'ME21B034', collegeName: 'NIT Warangal', department: 'Mechanical Engg', year: 3, phone: '+91 76543 21098', avatar: 'PS', rating: 4.8, totalRides: 31, isVerified: true, role: 'STUDENT', gender: 'Female' },
  { id: 's4', name: 'Rahul Varma', email: 'rahul.varma@cbit.ac.in', studentId: 'CBIT2023007', rollNumber: '160123733007', collegeName: 'Chaitanya Bharathi Institute of Technology', department: 'Computer Science', year: 1, phone: '+91 65432 10987', avatar: 'RV', rating: 4.6, totalRides: 9, isVerified: true, role: 'STUDENT', gender: 'Male' },
  { id: 's5', name: 'Sneha Reddy', email: 'sneha.reddy@osmania.ac.in', studentId: 'OU2022023', rollNumber: '100522737023', collegeName: 'Osmania University', department: 'Information Tech', year: 2, phone: '+91 54321 09876', avatar: 'SR', rating: 4.9, totalRides: 45, isVerified: true, role: 'STUDENT', gender: 'Female' },
  { id: 's6', name: 'Karthik Naidu', email: 'karthik.naidu@jntuh.ac.in', studentId: 'JNTU2021009', rollNumber: '21011A0409', collegeName: 'JNTU Hyderabad', department: 'Electronics', year: 3, phone: '+91 43210 98765', avatar: 'KN', rating: 4.5, totalRides: 17, isVerified: true, role: 'STUDENT', gender: 'Male' },
  { id: 's7', name: 'Ananya Patel', email: 'ananya.patel@iiit.ac.in', studentId: 'IIIT2020044', rollNumber: '2020101044', collegeName: 'IIIT Hyderabad', department: 'AI & Data Science', year: 4, phone: '+91 32109 87654', avatar: 'AP', rating: 4.8, totalRides: 56, isVerified: true, role: 'STUDENT', gender: 'Female' },
  { id: 's8', name: 'Rohit Kumar', email: 'rohit.kumar@uohyd.ac.in', studentId: 'UOH2022003', rollNumber: '22MBBA03', collegeName: 'University of Hyderabad', department: 'Management', year: 2, phone: '+91 21098 76543', avatar: 'RK', rating: 4.3, totalRides: 12, isVerified: true, role: 'STUDENT', gender: 'Male' },
  { id: 's9', name: 'Meera Singh', email: 'meera.singh@bits-pilani.ac.in', studentId: 'BITS2021018', rollNumber: '2021A1PS0018H', collegeName: 'BITS Pilani Hyderabad', department: 'Biotechnology', year: 3, phone: '+91 10987 65432', avatar: 'MS', rating: 4.7, totalRides: 28, isVerified: true, role: 'STUDENT', gender: 'Female' },
  { id: 's10', name: 'Vivek Reddy', email: 'vivek.reddy@campusflow.io', studentId: 'CF2022031', rollNumber: 'CF2022CE31', collegeName: 'CampusFlow Academy', department: 'Civil Engg', year: 2, phone: '+91 09876 54321', avatar: 'VR', rating: 4.6, totalRides: 19, isVerified: true, role: 'STUDENT', gender: 'Male' },
]

// =============================================================================
// 5 Faculty Seed Data (All with verified academic institution domains)
// =============================================================================
const FACULTY_SEED = [
  { id: 'f1', name: 'Dr. Ramesh Sharma', email: 'ramesh.sharma@sriindu.ac.in', studentId: 'FAC-2026-001', collegeId: 'FAC-2026-001', collegeName: 'Sri Indu College of Engineering & Technology', department: 'Computer Science & Engineering', year: 1, phone: '+91 91234 56780', avatar: 'RS', rating: 5.0, totalRides: 64, isVerified: true, role: 'FACULTY', gender: 'Male' },
  { id: 'f2', name: 'Prof. Lakshmi Nair', email: 'prof.lakshmi.nair@iith.ac.in', studentId: 'FAC-IITH-012', collegeId: 'FAC-IITH-012', collegeName: 'IIT Hyderabad', department: 'Electrical Engineering', year: 1, phone: '+91 82345 67891', avatar: 'LN', rating: 4.9, totalRides: 42, isVerified: true, role: 'FACULTY', gender: 'Female' },
  { id: 'f3', name: 'Dr. Venkat Rao', email: 'dr.venkat.rao@nitw.ac.in', studentId: 'FAC-NITW-045', collegeId: 'FAC-NITW-045', collegeName: 'NIT Warangal', department: 'Mechanical Engineering', year: 1, phone: '+91 73456 78902', avatar: 'VR', rating: 4.8, totalRides: 37, isVerified: true, role: 'FACULTY', gender: 'Male' },
  { id: 'f4', name: 'Prof. Sunita Gupta', email: 'prof.sunita.gupta@cbit.ac.in', studentId: 'FAC-CBIT-088', collegeId: 'FAC-CBIT-088', collegeName: 'Chaitanya Bharathi Institute of Technology', department: 'Physics & Nanotech', year: 1, phone: '+91 64567 89013', avatar: 'SG', rating: 4.9, totalRides: 51, isVerified: true, role: 'FACULTY', gender: 'Female' },
  { id: 'f5', name: 'Dr. Anil Kumar', email: 'dr.anil.kumar@osmania.ac.in', studentId: 'FAC-OU-007', collegeId: 'FAC-OU-007', collegeName: 'Osmania University', department: 'Dean of Sciences', year: 1, phone: '+91 55678 90124', avatar: 'AK', rating: 4.7, totalRides: 29, isVerified: true, role: 'FACULTY', gender: 'Male' },
]

// =============================================================================
// 20 Drivers Seed Data (All with personal @gmail.com email addresses)
// =============================================================================
const DRIVERS_SEED = [
  { id: 'd1', name: 'Rahul Kumar', email: 'rahul.kumar.driver@gmail.com', phone: '+91 99887 76655', avatar: 'RK', rating: 4.8, totalTrips: 312, isVerified: true, role: 'DRIVER', vehicleId: 'v1', vehicleRegistration: 'TS 09 AB 1234', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2018-004521' },
  { id: 'd2', name: 'Suresh Babu', email: 'suresh.babu.driver@gmail.com', phone: '+91 88776 65544', avatar: 'SB', rating: 4.6, totalTrips: 245, isVerified: true, role: 'DRIVER', vehicleId: 'v2', vehicleRegistration: 'TS 09 CD 5678', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-005612' },
  { id: 'd3', name: 'Ravi Kumar', email: 'ravi.kumar.cabs@gmail.com', phone: '+91 77665 54433', avatar: 'RK', rating: 4.9, totalTrips: 428, isVerified: true, role: 'DRIVER', vehicleId: 'v3', vehicleRegistration: 'TS 09 EF 9012', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-003489' },
  { id: 'd4', name: 'Mahesh Reddy', email: 'mahesh.reddy.trans@gmail.com', phone: '+91 66554 43322', avatar: 'MR', rating: 4.7, totalTrips: 189, isVerified: true, role: 'DRIVER', vehicleId: 'v4', vehicleRegistration: 'TS 09 GH 3456', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2020-006734' },
  { id: 'd5', name: 'Venkat Rao', email: 'venkat.rao.shuttle@gmail.com', phone: '+91 55443 32211', avatar: 'VR', rating: 4.5, totalTrips: 156, isVerified: true, role: 'DRIVER', vehicleId: 'v5', vehicleRegistration: 'TS 09 IJ 7890', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2018-002345' },
  { id: 'd6', name: 'Kiran Babu', email: 'kiran.babu.mobility@gmail.com', phone: '+91 44332 21100', avatar: 'KB', rating: 4.8, totalTrips: 267, isVerified: true, role: 'DRIVER', vehicleId: 'v6', vehicleRegistration: 'TS 09 KL 1357', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-007890' },
  { id: 'd7', name: 'Satish Kumar', email: 'satish.kumar.auto@gmail.com', phone: '+91 33221 10099', avatar: 'SK', rating: 4.6, totalTrips: 198, isVerified: true, role: 'DRIVER', vehicleId: 'v7', vehicleRegistration: 'TS 09 MN 2468', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-001278' },
  { id: 'd8', name: 'Prasad Naidu', email: 'prasad.naidu.driver@gmail.com', phone: '+91 22110 09988', avatar: 'PN', rating: 4.4, totalTrips: 134, isVerified: true, role: 'DRIVER', vehicleId: 'v8', vehicleRegistration: 'TS 09 OP 3691', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2018-009845' },
  { id: 'd9', name: 'Gopal Krishna', email: 'gopal.krishna.cabs@gmail.com', phone: '+91 91122 33445', avatar: 'GK', rating: 4.7, totalTrips: 210, isVerified: true, role: 'DRIVER', vehicleId: 'v9', vehicleRegistration: 'TS 09 QR 4820', vehicleType: 'Electric Shuttle', licenseNumber: 'TS-09-2020-004412' },
  { id: 'd10', name: 'Anil Varma', email: 'anil.varma.driver@gmail.com', phone: '+91 82233 44556', avatar: 'AV', rating: 4.8, totalTrips: 280, isVerified: true, role: 'DRIVER', vehicleId: 'v10', vehicleRegistration: 'TS 09 ST 5931', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-008923' },
  { id: 'd11', name: 'Srinivas Reddy', email: 'srinivas.reddy.van@gmail.com', phone: '+91 73344 55667', avatar: 'SR', rating: 4.5, totalTrips: 172, isVerified: true, role: 'DRIVER', vehicleId: 'v11', vehicleRegistration: 'TS 09 UV 6042', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2019-003319' },
  { id: 'd12', name: 'Mohammed Ali', email: 'mohammed.ali.driver@gmail.com', phone: '+91 64455 66778', avatar: 'MA', rating: 4.9, totalTrips: 390, isVerified: true, role: 'DRIVER', vehicleId: 'v12', vehicleRegistration: 'TS 09 WX 7153', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2016-006745' },
  { id: 'd13', name: 'Ramesh Yadav', email: 'ramesh.yadav.auto@gmail.com', phone: '+91 55566 77889', avatar: 'RY', rating: 4.6, totalTrips: 165, isVerified: true, role: 'DRIVER', vehicleId: 'v13', vehicleRegistration: 'TS 09 YZ 8264', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-005531' },
  { id: 'd14', name: 'Manoj Kumar', email: 'manoj.kumar.driver@gmail.com', phone: '+91 46677 88990', avatar: 'MK', rating: 4.7, totalTrips: 225, isVerified: true, role: 'DRIVER', vehicleId: 'v14', vehicleRegistration: 'TS 09 AA 9375', vehicleType: 'Campus Van', licenseNumber: 'TS-09-2018-007722' },
  { id: 'd15', name: 'Vijay Sharma', email: 'vijay.sharma.cabs@gmail.com', phone: '+91 37788 99001', avatar: 'VS', rating: 4.8, totalTrips: 340, isVerified: true, role: 'DRIVER', vehicleId: 'v15', vehicleRegistration: 'TS 09 BB 1486', vehicleType: 'Electric Shuttle', licenseNumber: 'TS-09-2019-008891' },
  { id: 'd16', name: 'Krishna Murthy', email: 'krishna.murthy.shuttle@gmail.com', phone: '+91 28899 00112', avatar: 'KM', rating: 4.5, totalTrips: 195, isVerified: true, role: 'DRIVER', vehicleId: 'v16', vehicleRegistration: 'TS 09 CC 2597', vehicleType: 'Campus Bus', licenseNumber: 'TS-09-2017-002244' },
  { id: 'd17', name: 'Baskar Rao', email: 'baskar.rao.mobility@gmail.com', phone: '+91 19900 11223', avatar: 'BR', rating: 4.6, totalTrips: 180, isVerified: true, role: 'DRIVER', vehicleId: 'v17', vehicleRegistration: 'TS 09 DD 3608', vehicleType: 'Mini Van', licenseNumber: 'TS-09-2020-001188' },
  { id: 'd18', name: 'Jagdish Chandra', email: 'jagdish.chandra.driver@gmail.com', phone: '+91 90011 22334', avatar: 'JC', rating: 4.4, totalTrips: 140, isVerified: true, role: 'DRIVER', vehicleId: 'v18', vehicleRegistration: 'TS 09 EE 4719', vehicleType: 'Campus Van', licenseNumber: 'TS-09-2018-006655' },
  { id: 'd19', name: 'Shankar Naik', email: 'shankar.naik.van@gmail.com', phone: '+91 81122 33445', avatar: 'SN', rating: 4.8, totalTrips: 305, isVerified: true, role: 'DRIVER', vehicleId: 'v19', vehicleRegistration: 'TS 09 FF 5820', vehicleType: 'Campus Shuttle Bus', licenseNumber: 'TS-09-2016-009933' },
  { id: 'd20', name: 'Praveen Kumar', email: 'praveen.kumar.driver@gmail.com', phone: '+91 72233 44556', avatar: 'PK', rating: 4.7, totalTrips: 260, isVerified: true, role: 'DRIVER', vehicleId: 'v20', vehicleRegistration: 'TS 09 GG 6931', vehicleType: 'Auto Rickshaw', licenseNumber: 'TS-09-2021-004477' },
]

// Central Admin Seed
const ADMIN_SEED = {
  id: 'admin1',
  name: 'Campus Dispatch Control',
  email: 'admin@campus.edu',
  phone: '+91 90000 00000',
  avatar: 'DC',
  rating: 5.0,
  totalTrips: 0,
  isVerified: true,
  role: 'ADMIN',
}

// 20 Vehicles Seed Data (mapped 1-to-1 to 20 drivers)
const VEHICLES_SEED = [
  { id: 'v1', name: 'Campus Shuttle Bus 01 (V1)', driverId: 'd1', vehicleType: 'Campus Shuttle Bus', registrationNumber: 'TS 09 AB 1234', capacity: 12, status: 'ON_TRIP', color: '#0891B2', rating: 4.8, totalTrips: 312 },
  { id: 'v2', name: 'Campus Van 07', driverId: 'd2', vehicleType: 'Mini Van', registrationNumber: 'TS 09 CD 5678', capacity: 6, status: 'AVAILABLE', color: '#7C3AED', rating: 4.6, totalTrips: 245 },
  { id: 'v3', name: 'Campus Bus 03', driverId: 'd3', vehicleType: 'Mini Bus', registrationNumber: 'TS 09 EF 9012', capacity: 12, status: 'ON_TRIP', color: '#059669', rating: 4.9, totalTrips: 428 },
  { id: 'v4', name: 'Campus Van 15', driverId: 'd4', vehicleType: 'Mini Van', registrationNumber: 'TS 09 GH 3456', capacity: 6, status: 'AVAILABLE', color: '#D97706', rating: 4.7, totalTrips: 189 },
  { id: 'v5', name: 'Campus Van 09', driverId: 'd5', vehicleType: 'Mini Van', registrationNumber: 'TS 09 IJ 7890', capacity: 6, status: 'ON_TRIP', color: '#DC2626', rating: 4.5, totalTrips: 156 },
  { id: 'v6', name: 'Campus Van 21', driverId: 'd6', vehicleType: 'Mini Van', registrationNumber: 'TS 09 KL 1357', capacity: 6, status: 'AVAILABLE', color: '#0891B2', rating: 4.8, totalTrips: 267 },
  { id: 'v7', name: 'Campus Auto 04', driverId: 'd7', vehicleType: 'Auto Rickshaw', registrationNumber: 'TS 09 MN 2468', capacity: 3, status: 'ON_TRIP', color: '#F59E0B', rating: 4.6, totalTrips: 198 },
  { id: 'v8', name: 'Campus Van 18', driverId: 'd8', vehicleType: 'Mini Van', registrationNumber: 'TS 09 OP 3691', capacity: 6, status: 'AVAILABLE', color: '#6366F1', rating: 4.4, totalTrips: 134 },
  { id: 'v9', name: 'Electric Shuttle 02', driverId: 'd9', vehicleType: 'Electric Shuttle', registrationNumber: 'TS 09 QR 4820', capacity: 8, status: 'AVAILABLE', color: '#10B981', rating: 4.7, totalTrips: 210 },
  { id: 'v10', name: 'Campus Express Bus 05', driverId: 'd10', vehicleType: 'Campus Bus', registrationNumber: 'TS 09 ST 5931', capacity: 16, status: 'AVAILABLE', color: '#3B82F6', rating: 4.8, totalTrips: 280 },
  { id: 'v11', name: 'Campus Van 11', driverId: 'd11', vehicleType: 'Mini Van', registrationNumber: 'TS 09 UV 6042', capacity: 6, status: 'AVAILABLE', color: '#8B5CF6', rating: 4.5, totalTrips: 172 },
  { id: 'v12', name: 'Campus Shuttle Bus 06', driverId: 'd12', vehicleType: 'Campus Shuttle Bus', registrationNumber: 'TS 09 WX 7153', capacity: 12, status: 'AVAILABLE', color: '#06B6D4', rating: 4.9, totalTrips: 390 },
  { id: 'v13', name: 'Campus Auto 08', driverId: 'd13', vehicleType: 'Auto Rickshaw', registrationNumber: 'TS 09 YZ 8264', capacity: 3, status: 'AVAILABLE', color: '#F59E0B', rating: 4.6, totalTrips: 165 },
  { id: 'v14', name: 'Campus Van 25', driverId: 'd14', vehicleType: 'Campus Van', registrationNumber: 'TS 09 AA 9375', capacity: 6, status: 'AVAILABLE', color: '#EC4899', rating: 4.7, totalTrips: 225 },
  { id: 'v15', name: 'Electric Shuttle 09', driverId: 'd15', vehicleType: 'Electric Shuttle', registrationNumber: 'TS 09 BB 1486', capacity: 8, status: 'AVAILABLE', color: '#14B8A6', rating: 4.8, totalTrips: 340 },
  { id: 'v16', name: 'Campus Bus 14', driverId: 'd16', vehicleType: 'Campus Bus', registrationNumber: 'TS 09 CC 2597', capacity: 14, status: 'AVAILABLE', color: '#6366F1', rating: 4.5, totalTrips: 195 },
  { id: 'v17', name: 'Campus Van 30', driverId: 'd17', vehicleType: 'Mini Van', registrationNumber: 'TS 09 DD 3608', capacity: 6, status: 'AVAILABLE', color: '#F97316', rating: 4.6, totalTrips: 180 },
  { id: 'v18', name: 'Campus Van 33', driverId: 'd18', vehicleType: 'Campus Van', registrationNumber: 'TS 09 EE 4719', capacity: 6, status: 'AVAILABLE', color: '#84CC16', rating: 4.4, totalTrips: 140 },
  { id: 'v19', name: 'Campus Shuttle Bus 08', driverId: 'd19', vehicleType: 'Campus Shuttle Bus', registrationNumber: 'TS 09 FF 5820', capacity: 12, status: 'AVAILABLE', color: '#0EA5E9', rating: 4.8, totalTrips: 305 },
  { id: 'v20', name: 'Campus Auto 12', driverId: 'd20', vehicleType: 'Auto Rickshaw', registrationNumber: 'TS 09 GG 6931', capacity: 3, status: 'AVAILABLE', color: '#EAB308', rating: 4.7, totalTrips: 260 },
]

// 11 Rides Seed Data (including Pooled Campus Shuttle V1)
const RIDES_SEED = [
  // Pooled Campus Shuttle: Vehicle V1 (12-capacity shuttle with 5 pooled passengers and individual fares)
  {
    id: 'ride-demo-v1',
    routeName: 'Campus Shuttle V1',
    driverId: 'd1',
    vehicleId: 'v1',
    pickupPoints: [
      { id: 'stop-1', name: 'Stop 1 - Campus Main Gate', lat: 17.3616, lng: 78.4747, estimatedPickupTime: '8:00 AM' },
      { id: 'stop-2', name: 'Stop 2 - Science Block', lat: 17.3850, lng: 78.4867, estimatedPickupTime: '8:10 AM' },
      { id: 'stop-3', name: 'Stop 3 - Hostel Hub', lat: 17.4000, lng: 78.4900, estimatedPickupTime: '8:20 AM' },
      { id: 'stop-4', name: 'Stop 4 - Central Library', lat: 17.4156, lng: 78.4357, estimatedPickupTime: '8:30 AM' },
      { id: 'stop-5', name: 'Stop 5 - Tech Park', lat: 17.4435, lng: 78.3772, estimatedPickupTime: '8:45 AM' },
    ],
    destination: 'Stop 7 - Sports Complex',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '8:00 AM',
    estimatedArrival: '9:05 AM',
    capacity: 12,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 53,
    totalFareAmount: 0,
    averageFare: 53,
    totalSharedSavings: 55,
    demandLevel: 'NORMAL',
    currentLat: 17.3850,
    currentLng: 78.4867,
    distanceKm: 28.4,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
    routeCoordinates: [
      [17.3616, 78.4747],
      [17.3850, 78.4867],
      [17.4000, 78.4900],
      [17.4156, 78.4357],
      [17.4435, 78.3772],
      [17.2063, 78.6015],
    ],
  },
  // Ride #101: Waiting
  {
    id: 'ride-101',
    routeName: 'Campus Route #101',
    driverId: 'd2',
    vehicleId: 'v2',
    pickupPoints: [
      { id: 'pp1', name: 'Charminar', lat: 17.3616, lng: 78.4747, estimatedPickupTime: '7:50 AM' },
      { id: 'pp2', name: 'Banjara Hills', lat: 17.4156, lng: 78.4357, estimatedPickupTime: '7:58 AM' },
    ],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '7:50 AM',
    estimatedArrival: '8:12 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 20,
    routeCoordinates: [
      [17.3616, 78.4747],
      [17.4156, 78.4357],
      [17.2063, 78.6015],
    ],
    currentLat: 17.3616,
    currentLng: 78.4747,
    distanceKm: 18.5,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #102: Available
  {
    id: 'ride-102',
    routeName: 'Campus Route #102',
    driverId: 'd1',
    vehicleId: 'v1',
    pickupPoints: [
      { id: 'pp3', name: 'Kukatpally', lat: 17.4934, lng: 78.3995, estimatedPickupTime: '8:15 AM' },
      { id: 'pp4', name: 'HITEC City', lat: 17.4435, lng: 78.3772, estimatedPickupTime: '8:22 AM' },
    ],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '8:15 AM',
    estimatedArrival: '8:38 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 25,
    routeCoordinates: [
      [17.4934, 78.3995],
      [17.4435, 78.3772],
      [17.2063, 78.6015],
    ],
    currentLat: 17.4934,
    currentLng: 78.3995,
    distanceKm: 24.2,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #103: Waiting
  {
    id: 'ride-103',
    routeName: 'Campus Route #103',
    driverId: 'd3',
    vehicleId: 'v3',
    pickupPoints: [
      { id: 'pp5', name: 'Secunderabad Junction', lat: 17.4334, lng: 78.5016, estimatedPickupTime: '8:05 AM' },
      { id: 'pp6', name: 'Jubilee Hills', lat: 17.4319, lng: 78.4073, estimatedPickupTime: '8:15 AM' },
    ],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '8:05 AM',
    estimatedArrival: '8:35 AM',
    capacity: 12,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 30,
    routeCoordinates: [
      [17.4334, 78.5016],
      [17.4319, 78.4073],
      [17.2063, 78.6015],
    ],
    currentLat: 17.4334,
    currentLng: 78.5016,
    distanceKm: 22.1,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #104: Waiting
  {
    id: 'ride-104',
    routeName: 'Campus Route #104',
    driverId: 'd4',
    vehicleId: 'v4',
    pickupPoints: [{ id: 'pp7', name: 'Banjara Hills', lat: 17.4156, lng: 78.4357, estimatedPickupTime: '8:00 AM' }],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '8:00 AM',
    estimatedArrival: '8:20 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 22,
    routeCoordinates: [
      [17.4156, 78.4357],
      [17.2063, 78.6015],
    ],
    currentLat: 17.4156,
    currentLng: 78.4357,
    distanceKm: 19.2,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #105: Waiting
  {
    id: 'ride-105',
    routeName: 'Campus Route #105',
    driverId: 'd5',
    vehicleId: 'v5',
    pickupPoints: [{ id: 'pp8', name: 'HITEC City', lat: 17.4435, lng: 78.3772, estimatedPickupTime: '7:45 AM' }],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '7:45 AM',
    estimatedArrival: '8:05 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 18,
    routeCoordinates: [
      [17.4435, 78.3772],
      [17.2063, 78.6015],
    ],
    currentLat: 17.4435,
    currentLng: 78.3772,
    distanceKm: 25.5,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #106: Waiting
  {
    id: 'ride-106',
    routeName: 'Campus Route #106',
    driverId: 'd6',
    vehicleId: 'v6',
    pickupPoints: [{ id: 'pp9', name: 'Kukatpally', lat: 17.4934, lng: 78.3995, estimatedPickupTime: '9:00 AM' }],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '9:00 AM',
    estimatedArrival: '9:20 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 25,
    routeCoordinates: [
      [17.4934, 78.3995],
      [17.2063, 78.6015],
    ],
    currentLat: 17.4934,
    currentLng: 78.3995,
    distanceKm: 24.2,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #107: Waiting
  {
    id: 'ride-107',
    routeName: 'Campus Route #107',
    driverId: 'd7',
    vehicleId: 'v7',
    pickupPoints: [{ id: 'pp10', name: 'Charminar', lat: 17.3616, lng: 78.4747, estimatedPickupTime: '8:30 AM' }],
    destination: 'SRI INDU College',
    destinationLat: 17.2063,
    destinationLng: 78.6015,
    departureTime: '8:30 AM',
    estimatedArrival: '8:50 AM',
    capacity: 3,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 20,
    routeCoordinates: [
      [17.3616, 78.4747],
      [17.2063, 78.6015],
    ],
    currentLat: 17.3616,
    currentLng: 78.4747,
    distanceKm: 18.9,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'today',
  },

  // Ride #108: Scheduled tomorrow
  {
    id: 'ride-108',
    routeName: 'Campus Route #108',
    driverId: 'd8',
    vehicleId: 'v8',
    pickupPoints: [
      { id: 'pp11', name: 'Secunderabad Station', lat: 17.4344, lng: 78.5017, estimatedPickupTime: '7:30 AM' },
      { id: 'pp12', name: 'Sri Indu Boys Hostel', lat: 17.398, lng: 78.479, estimatedPickupTime: '7:42 AM' },
    ],
    destination: 'Sri Indu College Main Gate',
    destinationLat: 17.387,
    destinationLng: 78.486,
    departureTime: '7:30 AM',
    estimatedArrival: '8:00 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'waiting',
    fare: 35,
    routeCoordinates: [
      [17.4, 78.485],
      [17.399, 78.482],
      [17.398, 78.479],
      [17.393, 78.483],
      [17.387, 78.486],
    ],
    currentLat: 17.4,
    currentLng: 78.485,
    distanceKm: 5.8,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'tomorrow',
  },

  // Completed rides for history
  {
    id: 'ride-201',
    routeName: 'Campus Route #098',
    driverId: 'd1',
    vehicleId: 'v1',
    pickupPoints: [{ id: 'pp20', name: 'Railway Station', lat: 17.4, lng: 78.485, estimatedPickupTime: '7:00 AM' }],
    destination: 'Main Campus',
    destinationLat: 17.387,
    destinationLng: 78.486,
    departureTime: '7:00 AM',
    estimatedArrival: '7:22 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'completed',
    fare: 35,
    routeCoordinates: [[17.4, 78.485], [17.387, 78.486]],
    currentLat: 17.387,
    currentLng: 78.486,
    distanceKm: 5.1,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'yesterday',
  },
  {
    id: 'ride-202',
    routeName: 'Campus Route #095',
    driverId: 'd2',
    vehicleId: 'v2',
    pickupPoints: [{ id: 'pp21', name: 'Sri Indu Boys Hostel', lat: 17.398, lng: 78.479, estimatedPickupTime: '8:20 AM' }],
    destination: 'Sri Indu Central Library',
    destinationLat: 17.3865,
    destinationLng: 78.4855,
    departureTime: '8:20 AM',
    estimatedArrival: '8:40 AM',
    capacity: 6,
    bookedSeats: 0,
    passengers: [],
    status: 'completed',
    fare: 20,
    routeCoordinates: [[17.398, 78.479], [17.3865, 78.4855]],
    currentLat: 17.3865,
    currentLng: 78.4855,
    distanceKm: 3.5,
    hasDeviation: false,
    hasSosAlert: false,
    date: 'yesterday',
  },
]

export async function seedDatabase() {
  console.log('[Seed] Starting MongoDB database seeding...')
  await connectDatabase()

  // Clean collections completely
  await Promise.all([
    UserModel.deleteMany({}),
    VehicleModel.deleteMany({}),
    RideModel.deleteMany({}),
    BookingModel.deleteMany({}),
    SafetyEventModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    PricingConfigModel.deleteMany({}),
    RideFareModel.deleteMany({}),
    PricingEventModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    RideRequestModel.deleteMany({}),
    RatingModel.deleteMany({}),
    EmergencyContactModel.deleteMany({}),
  ])
  console.log('[Seed] Wiped all collections in database.')

  // Insert Default Campus Pricing Config
  await PricingConfigModel.create({
    id: 'campus_default',
    name: 'Standard Campus Policy',
    baseFare: 20,
    perKmRate: 8,
    perMinuteRate: 1,
    minimumFare: 30,
    maximumFare: 500,
    sharedDiscountCap: 0.30,
    aiAdjustmentCap: 0.10,
    isActive: true,
  })
  console.log('[Seed] Inserted campus pricing configuration (base ₹20, per km ₹8, min ₹30, max ₹500, max discount 30%).')

  // Insert Users with standard default password ('campus2026')
  const defaultPasswordHash = await bcrypt.hash('campus2026', 10)
  const seededUsers = [...STUDENTS_SEED, ...FACULTY_SEED, ...DRIVERS_SEED, ADMIN_SEED].map((u) => ({
    ...u,
    isVerified: true,
    verificationStatus: 'VERIFIED',
    passwordHash: defaultPasswordHash,
  }))
  await UserModel.insertMany(seededUsers)
  console.log(
    `[Seed] Inserted ${STUDENTS_SEED.length} students, ${FACULTY_SEED.length} faculty, ` +
    `${DRIVERS_SEED.length} drivers, and 1 admin (Total: ${seededUsers.length} verified users).`
  )

  // Insert Emergency Contacts
  const emergencyContacts = [
    { id: 'ec-s1', userId: 's1', name: 'udaykiran', relationship: 'Parent', phone: '+917989442841', email: 'udaykiran.emergency@sriindu.ac.in', isPrimary: true },
    { id: 'ec-s2', userId: 's2', name: 'S. Rao (Father)', relationship: 'Parent', phone: '+91 87654 32199', email: 'srao.parent@iith.ac.in', isPrimary: true },
    { id: 'ec-s3', userId: 's3', name: 'M. Sharma (Mother)', relationship: 'Parent', phone: '+91 76543 21999', email: 'msharma.parent@nitw.ac.in', isPrimary: true },
    { id: 'ec-f1', userId: 'f1', name: 'Sunita Sharma (Spouse)', relationship: 'Spouse', phone: '+91 91234 56789', email: 'sunita.sharma@sriindu.ac.in', isPrimary: true },
    { id: 'ec-d1', userId: 'd1', name: 'Meena Kumar (Spouse)', relationship: 'Spouse', phone: '+91 99887 76600', email: 'meena.kumar.family@gmail.com', isPrimary: true },
  ]
  await EmergencyContactModel.insertMany(emergencyContacts)
  console.log(`[Seed] Inserted ${emergencyContacts.length} emergency contacts for campus accounts.`)

  // Insert Vehicles
  await VehicleModel.insertMany(VEHICLES_SEED)
  console.log(`[Seed] Inserted ${VEHICLES_SEED.length} campus vehicles.`)

  // Insert Rides with enriched driver and vehicle data
  const driverMap = new Map(DRIVERS_SEED.map((d) => [d.id, d]))
  const vehicleMap = new Map(VEHICLES_SEED.map((v) => [v.id, v]))
  const enrichedRides = RIDES_SEED.map((r) => {
    const driver = driverMap.get(r.driverId)
    const vehicle = vehicleMap.get(r.vehicleId)
    return {
      ...r,
      driverName: driver?.name || 'Rahul Kumar',
      driverPhone: driver?.phone || '+91 99887 76655',
      driverRating: driver?.rating || 4.8,
      driverAvatar: driver?.avatar || 'RK',
      vehicleName: vehicle?.name || 'Campus Shuttle Bus 01 (V1)',
      vehiclePlate: vehicle?.registrationNumber || 'TS 09 AB 1234',
    }
  })
  await RideModel.insertMany(enrichedRides)
  console.log(`[Seed] Inserted ${enrichedRides.length} rides across various lifecycle states with verified driver and vehicle details.`)

  // Safety Event (Ride #105 historical deviation)
  await SafetyEventModel.create({
    id: 'se1',
    rideId: 'ride-105',
    vehicleId: 'v5',
    eventType: 'ROUTE_DEVIATION',
    severity: 'HIGH',
    lat: 17.3825,
    lng: 78.4715,
    message: 'Ride #105 deviated from planned route. Vehicle moved to Unplanned Road near Hostel Zone.',
    status: 'ACTIVE',
    resolved: false,
  })

  // Insert Welcome Notifications (real system messages only)
  const initialNotifications = [
    { id: 'n1', userId: 's1', type: 'system', title: 'Welcome to Campus Mobility', message: 'Your account is verified. Start sharing rides and save money!', read: false },
    { id: 'n2', userId: 'admin1', type: 'system', title: 'System Online', message: 'Campus Mobility fleet dispatch service initialized and operating normally.', read: false },
  ]
  await NotificationModel.insertMany(initialNotifications)

  console.log('[Seed] Database seeding finished successfully.')
}

// If invoked directly from command line
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Seeding error:', err)
      process.exit(1)
    })
}
