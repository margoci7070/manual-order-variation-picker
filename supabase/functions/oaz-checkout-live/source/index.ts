import {consentBoundRPC} from '../consumer/checkout-binding.ts';
import { productionCors } from '../_live/domain-cors.ts';
import { admin, stripeClient, verifyAccount, env } from '../_live/runtime.ts';
import { checkoutHandler } from '../_live/checkout.ts';
import { json } from '../_live/core.ts';
Deno.serve(productionCors(async (req: Request) => {
  try {
    return await checkoutHandler(consentBoundRPC(admin().rpc, req.headers.get('x-oaz-consent')), stripeClient, (s) => verifyAccount(s, true), env('OAZ_STRIPE_LIVE_LAUNCH_TOKEN'))(req);
  } catch { return json({ error: 'checkout_unavailable' }, 503); }
}));
