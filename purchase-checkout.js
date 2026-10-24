const API='https://dbqilazxxsnskbgbrxdv.supabase.co/functions/v1';
const keyInput=document.getElementById('license'),status=document.getElementById('status'),download=document.getElementById('download');
const businessFields=document.getElementById('business-fields'),company=document.getElementById('company'),taxId=document.getElementById('tax-id');
const purchaseStatus=document.getElementById('purchase-status'),buy=document.getElementById('buy');
document.querySelectorAll('input[name=buyer_type]').forEach(el=>el.addEventListener('change',()=>{const business=el.checked&&el.value==='business';if(el.checked){businessFields.hidden=!business;company.required=business;taxId.required=business;if(!business){company.value='';taxId.value='';}}}));
const localKey=sessionStorage.getItem('oaz_movp_live_key');if(localKey&&/^OAZ-[0-9a-f]{64}$/.test(localKey))keyInput.value=localKey;
const result=new URL(location.href).searchParams.get('result');purchaseStatus.textContent=result==='success'?'Returned from Checkout. Payment and license status must still be verified below.':result==='cancel'?'Checkout was cancelled. No payment is confirmed by this page.':'Live purchasing is not enabled.';
function value(id){return document.getElementById(id).value.trim();}
function newLicenseKey(){const bytes=crypto.getRandomValues(new Uint8Array(32));return 'OAZ-'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function purchaseInput(){
 const buyer=document.querySelector('input[name=buyer_type]:checked')?.value;
 const email=value('email').toLowerCase(),country=value('billing-country').toUpperCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address.');
 if(buyer!=='private'&&buyer!=='business')throw Error('Choose a buyer type.');
 if(!value('billing-name')||!/^[A-Z]{2}$/.test(country)||!value('billing-line1')||!value('billing-city')||!value('billing-postal-code'))throw Error('Complete all required billing details.');
 if(buyer==='business'&&(!value('company')||!value('tax-id')))throw Error('Complete the company name and Tax / VAT ID.');
 if(!document.getElementById('legal-consent').checked||!document.getElementById('delivery-consent').checked)throw Error('Both required legal declarations must be accepted.');
 return {email,buyer,country};
}
async function recordConsent(input){
 const response=await fetch(API+'/oaz-consumer-live/consent?language=en',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),email:input.email,language:'en',customer_type:input.buyer==='business'?'business':'consumer',choices:{terms:true,privacy_read:true,digital_start:true,digital_ack:true,service_start:true,service_ack:true}}),cache:'no-store'});
 const data=await response.json().catch(()=>({}));if(!response.ok||!/^[a-f0-9]{64}$/.test(data.consent_token||''))throw Error('Your legal declarations could not be recorded. Please retry.');return data.consent_token;
}
function checkoutBody(input,key){return {email:input.email,license_key:key,buyer_type:input.buyer,billing_name:value('billing-name'),billing_country:input.country,billing_line1:value('billing-line1'),billing_line2:value('billing-line2'),billing_city:value('billing-city'),billing_postal_code:value('billing-postal-code'),billing_state:value('billing-state'),business_name:input.buyer==='business'?value('company'):'',tax_vat_id:input.buyer==='business'?value('tax-id'):''};}
async function beginPurchase(){
 purchaseStatus.textContent='Preparing secure checkout…';buy.disabled=true;
 try{const input=purchaseInput(),token=await recordConsent(input);let key=sessionStorage.getItem('oaz_movp_live_key');if(!key||!/^OAZ-[0-9a-f]{64}$/.test(key)){key=newLicenseKey();sessionStorage.setItem('oaz_movp_live_key',key);}keyInput.value=key;
  const response=await fetch(API+'/oaz-checkout-live',{method:'POST',headers:{'Content-Type':'application/json','x-oaz-consent':token},body:JSON.stringify(checkoutBody(input,key)),cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error==='live_sales_closed'||data.error==='live_launch_gate_closed'?'Live purchasing is not enabled.':'Secure checkout could not be started. Please retry.');
  const url=new URL(data.url);if(url.origin!=='https://checkout.stripe.com')throw Error('Invalid checkout response.');location.assign(url.href);
 }catch(error){purchaseStatus.textContent=error.message;}finally{buy.disabled=true;}
}
// Intentionally not attached while public sales are closed. Launch enables the button and this handler together.
window.oazBeginPurchase=beginPurchase;
async function licenseRequest(operation){const key=keyInput.value.trim();if(!/^OAZ-[0-9a-f]{64}$/.test(key))throw Error('Enter your complete license key.');const response=await fetch(API+'/oaz-license',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({operation}),cache:'no-store'});if(!response.ok)throw Error('License service unavailable or key not recognised. Please retry or contact support.');return response.json();}
document.getElementById('check').addEventListener('click',async()=>{download.disabled=true;document.getElementById('zip').hidden=true;status.textContent='Checking securely…';try{const data=await licenseRequest('status');if(data.state!=='issued'){status.textContent='Payment confirmation is pending. Please check again shortly.';return;}const expiry=data.access?.updates_until;status.textContent='License issued. Updates and support: '+(data.access?.support_active?'active':'inactive')+(expiry?'. Entitlement ends: '+new Date(expiry).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})+' (UTC).':'.')+' Your installed plugin continues working after the update/support period ends.';download.disabled=!data.access?.can_activate||!data.access?.latest_release_id;}catch(error){status.textContent=error.message;}});
download.addEventListener('click',async()=>{try{const data=await licenseRequest('download');const url=new URL(data.url);if(url.origin!=='https://dbqilazxxsnskbgbrxdv.supabase.co'||!url.pathname.startsWith('/storage/v1/object/sign/'))throw Error('Invalid download response.');const link=document.getElementById('zip');link.href=url.href;link.textContent='Download MOVP '+data.version+' (link valid for 60 seconds)';link.hidden=false;document.getElementById('hash').textContent='SHA-256: '+data.sha256;}catch(error){status.textContent=error.message;}});
