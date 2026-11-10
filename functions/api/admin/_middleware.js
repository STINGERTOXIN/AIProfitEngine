// Keep all administrator endpoints fail-closed by default.
// The subscriber endpoint performs its own Cloudflare Access JWT signature,
// issuer, audience, expiry, and administrator-email verification.
// Allow only that endpoint to reach its independent authorization handler.
export async function onRequest({request,next}) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/admin/subscribers') {
    // Without an Access assertion, never query or expose subscriber data.
    if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
      return Response.json(
        {error:'Administrator sign-in required through Cloudflare Access.'},
        {status:403,headers:{'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}}
      );
    }
    return next();
  }
  return Response.json(
    {error:'Administrative API temporarily disabled pending security verification.'},
    {status:503,headers:{'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'",'X-Content-Type-Options':'nosniff'}}
  );
}
