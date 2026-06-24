import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined. Create .env.local with MONGODB_URI=mongodb://localhost:27017/moveos_compliance')
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

// Persist connection across hot-reloads in dev
const globalWithCache = global as typeof global & { _mongooseCache?: MongooseCache }

const cached: MongooseCache = globalWithCache._mongooseCache ?? { conn: null, promise: null }
globalWithCache._mongooseCache = cached

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}
