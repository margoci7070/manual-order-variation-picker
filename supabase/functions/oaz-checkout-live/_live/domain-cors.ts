export function productionCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const response = await handler(req);
    const origin = req.headers.get('Origin');
    if (origin !== 'https://oneandzerosystems.com' && origin !== 'https://www.oneandzerosystems.com') return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type, x-oaz-consent');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
