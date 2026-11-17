/** Stateful fake Core, not a backend authorization test or real employee account. */
import {createHmac} from 'node:crypto';import {fixtureReply} from './account-visual-fixtures.mjs';
export function createJourneyCore({recover=false}={}){
 let registered=false,claimed=false,registrationNonce=null,commitOperation=null,code=null,registrationAttempts=0,previewAttempts=0,commitAttempts=0;
 return {reply(p){
  if(p.action==='bridgeAccountAccessOverviewV1')return fixtureReply(p,registered?'existing':'unregistered');
  if(p.action==='bridgeCreateAccount'){
   if(typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce))throw Error('INVALID_REGISTRATION_NONCE');
   registrationAttempts++;if(registrationNonce&&p.nonce!==registrationNonce)throw Error('DUPLICATE_REGISTRATION_NONCE');registrationNonce=p.nonce;registered=true;
   if(recover&&registrationAttempts===1)return null;
   return {type:'TLH_BRIDGE_ACCOUNT_CREATED',nonce:p.nonce,code:registrationAttempts===1?'CREATED':'ALREADY_REGISTERED'};
  }
  if(p.action!=='bridgeCommonServiceActivationV1'||p.command!=='CLAIM'||!registered)throw Error('UNEXPECTED_JOURNEY_ACTION');
  if(p.phase==='PREVIEW'){
   previewAttempts++;const input=JSON.parse(p.input);if(code&&input.inviteCode!==code)throw Error('CODE_CHANGED_AFTER_ERROR');code=input.inviteCode;
   const r=fixtureReply(p,'success');if(recover&&previewAttempts===1){r.code='COMMON_REVISION_CONFLICT';r.data='';r.mac=createHmac('sha256',p.responseKey).update([r.type,r.phase,r.command,r.nonce,r.code,r.data].join('\n')).digest('hex');}return r;
  }
  if(p.phase!=='COMMIT')throw Error('UNEXPECTED_JOURNEY_PHASE');if(typeof p.operationId!=='string'||!/^[a-f0-9]{32}$/.test(p.operationId))throw Error('INVALID_ACTIVATION_OPERATION');commitAttempts++;if(commitOperation&&p.operationId!==commitOperation)throw Error('DUPLICATE_ACTIVATION_OPERATION');commitOperation=p.operationId;claimed=true;
  if(recover&&commitAttempts===1)return null;return fixtureReply(p,'success');
 },summary(){return {registered,claimed,registrationAttempts,previewAttempts,commitAttempts,createdAccountCount:registered?1:0,appliedInvitationCount:claimed?1:0,countDefinition:'boolean fake model state, not persisted record counts or backend idempotency evidence',synthetic:true};}};
}
