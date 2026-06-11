import { useEffect, useRef, useCallback } from 'react'

interface UseWebSocketOptions {
  url: string
  onMessage: (data: any) => void
  enabled?: boolean
}

export function useWebSocket({ url, onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!enabled) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${url}`
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      try { onMessageRef.current(JSON.parse(event.data)) } catch {}
    }
    ws.onclose = () => { setTimeout(() => { if (wsRef.current === ws) wsRef.current = null }, 3000) }
    wsRef.current = ws
    return () => { ws.close() }
  }, [url, enabled])

  const send = useCallback((data: any) => { wsRef.current?.send(JSON.stringify(data)) }, [])
  return { send }
}
