import Stripe from 'stripe';
import { LIVE, type RPC } from './core.ts';
declare const Deno: { env: { get(key: string): string | undefined } };
export function env(name: string): string { return Deno.env.get(name) || ''; }
export function admin(): { rpc: RPC; key: string; url: string } {
  const url = env('SUPABASE_URL'); let key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) key = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default || '';
  if (url !== `https://${LIVE.project}.supabase.co` || !key) throw new Error('backend_not_configured');
  const rpc: RPC = async (name, args) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
    if(!response.ok){const data=await response.json().catch(()=>({}));const known=/^(invalid_license|activation_limit|hosting_staging_not_approved|production_activation_required|site_already_bound|multisite_not_supported|download_not_entitled|license_cannot_activate|checkout_expired|checkout_retry_conflict|not_related_staging|idempotent_retry_token_mismatch)$/;throw new Error(known.test(data.message)?data.message:'backend_operation_failed');}
    return response.status===204?null:response.json();
  };
  return { rpc, key, url };
}
export function stripeClient(): Stripe { const key=env('OAZ_STRIPE_LIVE_SECRET_KEY'); if(!/^(rk_live_)/.test(key))throw new Error('stripe_live_restricted_key_not_configured'); return new Stripe(key,{maxNetworkRetries:2,timeout:10000}); }
export async function verifyAccount(stripe: Stripe, requireCharges=false): Promise<void>{const account=await stripe.accounts.retrieve(null);if(account.id!==LIVE.account||(requireCharges&&!account.charges_enabled))throw new Error('stripe_account_mismatch');}
