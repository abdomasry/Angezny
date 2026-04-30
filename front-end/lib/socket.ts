// Socket.IO client singleton.
//
// Why a singleton and not per-component state:
// - Next.js Fast Refresh re-runs module code on every save. If we instantiate
//   io() at module top-level without a guard, every edit creates a new
//   WebSocket connection, leaking sockets and causing weird "I received the
//   same message 3 times" bugs.
// - We attach the Socket to globalThis.__socket so it survives HMR re-imports.
//
// Usage:
//   const socket = getSocket()       // connects lazily on first call
//   socket.emit('chat:send', ...)
//   socket.on('chat:message', ...)
//   disconnectSocket()                // on logout

import { io, Socket } from 'socket.io-client'

// Extend globalThis with our custom slot. Prefixed with __ to make intent
// obvious; prefixed with _APP to namespace away from anything else.
declare global {
  var __APP_SOCKET__: Socket | null | undefined
}

const BASE_URL = 'http://localhost:5000'

// Read the latest token from localStorage every time we (re)connect, so
// logging out and back in picks up the new token automatically.
const getToken = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

/**
 * Lazily returns the shared socket. Returns null during SSR or before login.
 * Safe to call from React render — won't cause infinite loops because the
 * same instance is returned after first connection.
 */
export function getSocket(): Socket | null {
  // SSR guard: Next still runs an initial server render on client pages.
  if (typeof window === 'undefined') return null

  // Already have a connected (or connecting) socket? Reuse it.
  if (globalThis.__APP_SOCKET__?.connected || globalThis.__APP_SOCKET__?.active) {
    return globalThis.__APP_SOCKET__
  }

  const token = getToken()
  if (!token) return null

  // Clean up any stale socket before creating a new one (e.g. after HMR
  // invalidated the old connection or after a logout/login cycle).
  if (globalThis.__APP_SOCKET__) {
    globalThis.__APP_SOCKET__.disconnect()
    globalThis.__APP_SOCKET__ = null
  }

  const socket = io(BASE_URL, {
    // auth goes in the handshake payload, NOT the URL query string, so the
    // token doesn't end up in access logs.
    auth: { token },
    // Skip the polling-first upgrade dance — the browser already supports WS.
    transports: ['websocket'],
    // Mild backoff on disconnect so we don't hammer the server on network blips.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  globalThis.__APP_SOCKET__ = socket
  return socket
}

/**
 * Explicitly disconnect and forget the socket. Call from logout handler.
 */
export function disconnectSocket() {
  if (globalThis.__APP_SOCKET__) {
    globalThis.__APP_SOCKET__.disconnect()
    globalThis.__APP_SOCKET__ = null
  }
}
