// Tiny HTTP helpers for the Franel Insights edge function (no deps).

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*"
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "retry-after",
  }
}

export function jsonOk(headers: Record<string, string>, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

export function jsonErr(
  status: number,
  message: string,
  headers: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...headers, ...extraHeaders },
  })
}

export function text401(message: string, headers: Record<string, string>): Response {
  console.warn(`[franel-insights] 401 ${new Date().toISOString()}\n${message}`)
  return new Response(message, {
    status: 401,
    headers: { "Content-Type": "text/plain", ...headers },
  })
}

export function text405(headers: Record<string, string>): Response {
  return new Response("Method not allowed", {
    status: 405,
    headers: { "Content-Type": "text/plain", ...headers },
  })
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? ""
  const prefix = "Bearer "
  if (!h.startsWith(prefix)) return null
  const token = h.slice(prefix.length).trim()
  return token || null
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}