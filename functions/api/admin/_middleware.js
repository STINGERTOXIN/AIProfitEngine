// Emergency fail-closed protection for all /api/admin/* endpoints.
// Do not remove until production deployment and Cloudflare Access authentication
// have been independently verified in a fresh, unauthenticated browser session.
export async function onRequest() {
  return Response.json(
    { error: 'Administrative API temporarily disabled pending security verification.' },
    { status: 503, headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff'
    }}
  );
}
