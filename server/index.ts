import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { ENV } from './config/env.js'
import { connectDatabase } from './config/database.js'
import { realtimeService } from './services/realtimeService.js'

// Route plugins
import { authRoutes } from './routes/auth.routes.js'
import { rideRoutes } from './routes/rides.routes.js'
import { rideRequestRoutes } from './routes/rideRequests.routes.js'
import { driverRoutes } from './routes/driver.routes.js'
import { dispatcherRoutes } from './routes/dispatcher.routes.js'
import { safetyRoutes } from './routes/safety.routes.js'
import { notificationRoutes } from './routes/notifications.routes.js'
import { demoRoutes } from './routes/demo.routes.js'
import { geocodingRoutes } from './routes/geocoding.routes.js'
import { optimizationRoutes } from './routes/optimization.routes.js'
import { pricingRoutes } from './routes/pricing.routes.js'
import { recoveryRoutes } from './routes/recovery.routes.js'
import { bookingRoutes } from './routes/bookings.routes.js'
import { pythonOptimizerService } from './services/pythonOptimizerService.js'

import { UserModel } from './models/User.js'
import { RideModel } from './models/Ride.js'
import { seedDatabase } from './seeds/seed.js'

export async function buildServer() {
  const fastify = Fastify({
    bodyLimit: 30 * 1024 * 1024, // 30MB limit for base64 photo uploads
    logger: {
      level: ENV.NODE_ENV === 'production' ? 'info' : 'warn',
    },
  })

  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // WebSockets for Realtime Telematics
  await fastify.register(websocket)

  // Multipart form data for secure document uploads
  const multipart = await import('@fastify/multipart')
  await fastify.register(multipart.default || multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
      files: 3,
    },
  })

  fastify.get('/realtime', { websocket: true }, (connection) => {
    const socket = (connection as any)?.socket || connection
    if (socket) {
      realtimeService.addClient(socket)
    }
  })

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: ENV.NODE_ENV,
    }
  })

  // API Route Plugins
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(authRoutes, { prefix: '/api' }) // for /api/users
  await fastify.register(rideRoutes, { prefix: '/api/rides' })
  await fastify.register(rideRequestRoutes, { prefix: '/api/ride-requests' })
  await fastify.register(driverRoutes, { prefix: '/api/driver' })
  await fastify.register(dispatcherRoutes, { prefix: '/api/dispatcher' })
  await fastify.register(safetyRoutes, { prefix: '/api/safety' })
  await fastify.register(notificationRoutes, { prefix: '/api/notifications' })
  await fastify.register(demoRoutes, { prefix: '/api/demo' })
  await fastify.register(geocodingRoutes, { prefix: '/api/geocoding' })
  await fastify.register(optimizationRoutes, { prefix: '/api/optimization' })
  await fastify.register(pricingRoutes, { prefix: '/api/pricing' })
  await fastify.register(recoveryRoutes, { prefix: '/api' })
  await fastify.register(bookingRoutes, { prefix: '/api/bookings' })

  // Error Handler
  fastify.setErrorHandler((error: any, request, reply) => {
    fastify.log.error(error)
    reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        message: error.message || 'Internal Server Error',
        code: error.code || 'INTERNAL_ERROR',
      },
    })
  })

  return fastify
}

export async function startServer() {
  try {
    // 1. Connect MongoDB
    await connectDatabase()

    // 2. Ensure Python AI Optimization Engine is running
    await pythonOptimizerService.ensureServiceStarted()

    // 3. Clean up any legacy hackathon strings from stored rides
    await RideModel.updateMany(
      { routeName: /hackathon/i },
      { $set: { routeName: 'Campus Shuttle V1' } }
    ).catch(() => {})

    // 4. Check if DB has data; auto-seed if empty
    const count = await UserModel.countDocuments()
    if (count === 0) {
      console.log('[Server] Database is empty. Seeding realistic campus data...')
      await seedDatabase()
    }

    // 3. Build & start Fastify
    const server = await buildServer()
    await server.listen({ port: ENV.PORT, host: ENV.HOST })
    console.log(`\n======================================================`)
    console.log(`🚀 Campus Mobility Backend LIVE at http://${ENV.HOST}:${ENV.PORT}`)
    console.log(`⚡ Realtime WebSocket STREAM at ws://${ENV.HOST}:${ENV.PORT}/realtime`)
    console.log(`======================================================\n`)
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err)
    process.exit(1)
  }
}

// Start if run directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  startServer()
}
