// Vercel Edge Middleware - Basic Auth con debug temporal
export const config = { matcher: '/((?!favicon\\.ico).*)' };
export default function middleware(request) {
  const auth = request.headers.get('authorization') || '';
  const user = process.env.BASIC_AUTH_USER || '';
  const pass = process.env.BASIC_AUTH_PASS || '';
  const expected = 'Basic ' + btoa(user + ':' + pass);
  if (auth !== expected) {
    return new Response('Acceso restringido. Solo coordinadores.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Club Kolbe", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=UTF-8',
        'X-Debug-UserLen': String(user.length),
        'X-Debug-PassLen': String(pass.length),
        'X-Debug-ExpectedPrefix': expected.slice(0, 20),
        'X-Debug-AuthPrefix': auth.slice(0, 20),
      },
    });
  }
}
