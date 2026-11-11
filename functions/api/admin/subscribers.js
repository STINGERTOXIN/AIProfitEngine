// Emergency fail-closed response: subscriber records must never be returned
// until Cloudflare Access protection is verified on every hostname.
export async function onRequestGet() {
  return Response.json({error:'Subscriber administration temporarily unavailable pending security verification.'},{status:503,headers:{'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}});
}
