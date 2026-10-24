import {sha,type RPC} from './consumer.ts';
export function consentBoundRPC(rpc:RPC,proof:string|null):RPC{return async(name,args)=>{
 if(name!=='oaz_begin_checkout_live')return rpc(name,args);
 if(!proof||!/^[a-f0-9]{64}$/.test(proof))throw Error('checkout_consent_required');
 const hash=await sha(proof);
 await rpc('oaz_consumer_validate_checkout',{p_token_hash:hash,p_email:args.p_email});
 const attempt=await rpc(name,args);
 await rpc('oaz_consumer_bind_checkout',{p_token_hash:hash,p_email:args.p_email,p_attempt:attempt.id});
 return attempt;
};}
