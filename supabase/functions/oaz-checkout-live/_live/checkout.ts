import { LIVE, json, readJSON, licenseKey, sha256, limit, Rejected, Pending, type RPC } from './core.ts';

export const RETURN_URL='https://oneandzerosystems.com/purchase.html';

export async function validLaunchToken(header:string|null,expected:string):Promise<boolean>{
  if(!/^[0-9a-f]{64}$/.test(expected))return false;
  const actual=header?.replace(/^Bearer /,'')||'';
  if(!/^[0-9a-f]{64}$/.test(actual))return false;
  const a=await sha256(actual),b=await sha256(expected);
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function requiredText(value:unknown,max:number,error:string):string{
  if(typeof value!=='string')throw new Rejected(error);
  const v=value.trim();
  if(!v||v.length>max)throw new Rejected(error);
  return v;
}
function optionalText(value:unknown,max:number,error:string):string|null{
  if(value==null||value==='')return null;
  if(typeof value!=='string')throw new Rejected(error);
  const v=value.trim();
  if(!v)return null;
  if(v.length>max)throw new Rejected(error);
  return v;
}
function billing(body:Record<string,any>){
  const buyerType=body.buyer_type;
  if(buyerType!=='private'&&buyerType!=='business')throw new Rejected('valid_buyer_type_required');
  const billingName=requiredText(body.billing_name,200,'billing_name_required');
  const billingCountry=requiredText(body.billing_country,2,'billing_country_required').toUpperCase();
  if(!/^[A-Z]{2}$/.test(billingCountry))throw new Rejected('billing_country_required');
  const billingLine1=requiredText(body.billing_line1,250,'billing_line1_required');
  const billingLine2=optionalText(body.billing_line2,250,'invalid_billing_line2');
  const billingCity=requiredText(body.billing_city,150,'billing_city_required');
  const billingPostalCode=requiredText(body.billing_postal_code,32,'billing_postal_code_required');
  const billingState=optionalText(body.billing_state,150,'invalid_billing_state');
  let businessName:string|null=null,taxVatId:string|null=null;
  if(buyerType==='business'){
    businessName=requiredText(body.business_name,200,'business_name_required');
    taxVatId=requiredText(body.tax_vat_id,40,'tax_vat_id_required');
  }else if((body.business_name!=null&&body.business_name!=='')||(body.tax_vat_id!=null&&body.tax_vat_id!=='')){
    throw new Rejected('unexpected_business_details');
  }
  return {buyerType,billingName,billingCountry,billingLine1,billingLine2,billingCity,billingPostalCode,billingState,businessName,taxVatId};
}

export function checkoutHandler(rpc:RPC,getStripe:()=>any,accountCheck:(stripe:any)=>Promise<void>,launchToken:string){
return async(req:Request):Promise<Response>=>{
 if(req.method==='OPTIONS')return json({});
 try{
  if(req.method==='GET'){
   const gate=await rpc('oaz_live_gate_status',{});let configured=false;
   try{const stripe=getStripe();await accountCheck(stripe);const [price,product]=await Promise.all([stripe.prices.retrieve(LIVE.price),stripe.products.retrieve(LIVE.product)]);configured=validCatalog(price,product);}catch{}
   return json({public_sales_enabled:gate?.public_sales_enabled===true,stripe_live_configured:configured,controlled_checkout_enabled:gate?.controlled_checkout_enabled===true,tax_review_complete:gate?.tax_review_complete===true,customer_flow_ready:gate?.customer_flow_ready===true,owner_token_configured:/^[0-9a-f]{64}$/.test(launchToken)});
  }
  if(req.method!=='POST')return json({error:'post_required'},405);

  const gate=await rpc('oaz_live_gate_status',{});
  const commonReady=gate?.tax_review_complete===true&&gate?.customer_flow_ready===true;
  const publicAllowed=commonReady&&gate?.public_sales_enabled===true;
  const ownerAuthorized=await validLaunchToken(req.headers.get('authorization'),launchToken);
  const controlledAllowed=commonReady&&gate?.controlled_checkout_enabled===true&&ownerAuthorized;
  if(!publicAllowed&&!controlledAllowed)return json({error:'live_sales_closed'},403);

  await limit(rpc,'checkout-live-global',10);
  const body=await readJSON(req),key=licenseKey(body.license_key);
  if(typeof body.email!=='string'||body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))throw new Rejected('valid_email_required');
  const allowed=['email','license_key','buyer_type','billing_name','billing_country','billing_line1','billing_line2','billing_city','billing_postal_code','billing_state','business_name','tax_vat_id'];
  if(Object.keys(body).some(k=>!allowed.includes(k)))throw new Rejected('unexpected_checkout_parameter');
  const b=billing(body);

  const stripe=getStripe();await accountCheck(stripe);
  const [price,product]=await Promise.all([stripe.prices.retrieve(LIVE.price),stripe.products.retrieve(LIVE.product)]);
  if(!validCatalog(price,product))throw new Rejected('live_price_mismatch');

  const attempt=await rpc('oaz_begin_checkout_live',{p_price:LIVE.price,p_account:LIVE.account,p_product:LIVE.product,p_email:body.email,p_key_hash:'\\x'+await sha256(key),p_environment:'live'});
  await rpc('oaz_set_checkout_billing_live',{
   p_attempt:attempt.id,p_email:body.email,p_buyer_type:b.buyerType,p_billing_name:b.billingName,
   p_billing_country:b.billingCountry,p_billing_line1:b.billingLine1,p_billing_line2:b.billingLine2,
   p_billing_city:b.billingCity,p_billing_postal_code:b.billingPostalCode,p_billing_state:b.billingState,
   p_business_name:b.businessName,p_tax_vat_id:b.taxVatId
  });
  if(attempt.checkout_url)return json({url:attempt.checkout_url});

  const metadata={oaz_attempt_id:attempt.id,oaz_order_id:attempt.order_id};
  const suffix=attempt.id.replaceAll('-','').slice(0,8).replace(/[0-9]/g,(n:string)=>String.fromCharCode(97+Number(n)));
  const session=await stripe.checkout.sessions.create({
   mode:'payment',line_items:[{price:LIVE.price,quantity:1}],customer_email:body.email,customer_creation:'always',
   billing_address_collection:'required',tax_id_collection:{enabled:true},
   success_url:`${RETURN_URL}?result=success`,cancel_url:`${RETURN_URL}?result=cancel`,
   metadata,payment_intent_data:{metadata},adaptive_pricing:{enabled:false},automatic_tax:{enabled:false},
   integration_identifier:`oaz-movp-live-${suffix}`,expires_at:Math.floor(new Date(attempt.expires_at).getTime()/1000)
  },{idempotencyKey:`oaz-checkout-live-${attempt.id}`});
  if(!session.url||!session.url.startsWith('https://checkout.stripe.com/')||!session.id?.startsWith('cs_live_')||session.livemode!==true||session.mode!=='payment')throw new Error('invalid_session');
  await rpc('oaz_bind_checkout_live',{p_attempt:attempt.id,p_session:session.id,p_url:session.url});
  return json({url:session.url});
 }catch(err){return json({error:err instanceof Rejected||err instanceof Pending?err.message:'checkout_unavailable'},err instanceof Rejected?400:503);}
};}

export function validCatalog(price:any,product:any):boolean{
 return price?.id===LIVE.price&&price.livemode===true&&price.active===true&&price.tax_behavior==='inclusive'&&price.type==='one_time'&&price.recurring==null&&price.unit_amount===3990&&price.currency==='usd'&&price.product===LIVE.product&&product?.id===LIVE.product&&product.active===true&&product.livemode===true;
}
