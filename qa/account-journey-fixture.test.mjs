import test from 'node:test';import assert from 'node:assert/strict';import {createJourneyCore} from './account-journey-fixture.mjs';
test('fake Core state changes across registration, same-code retry and same-operation recovery',()=>{
 const core=createJourneyCore({recover:true}),base={nonce:'a'.repeat(32),responseKey:'b'.repeat(64)};
 assert.equal(core.reply({...base,action:'bridgeAccountAccessOverviewV1'}).code,'COMMON_ACCOUNT_NOT_REGISTERED');
 const create={...base,action:'bridgeCreateAccount'};assert.equal(core.reply(create),null);assert.equal(core.reply(create).code,'ALREADY_REGISTERED');
 assert.equal(core.reply({...base,action:'bridgeAccountAccessOverviewV1'}).code,'ACCOUNT_ACCESS_OVERVIEW_READY');
 const claim={...base,action:'bridgeCommonServiceActivationV1',command:'CLAIM',input:JSON.stringify({inviteCode:'c'.repeat(64)}),operationId:'d'.repeat(32)};
 assert.equal(core.reply({...claim,phase:'PREVIEW'}).code,'COMMON_REVISION_CONFLICT');assert.equal(core.reply({...claim,phase:'PREVIEW'}).code,'COMMON_ACTIVATION_PREVIEW_READY');
 assert.equal(core.reply({...claim,phase:'COMMIT'}),null);assert.equal(core.reply({...claim,phase:'COMMIT',nonce:'e'.repeat(32)}).code,'COMMON_ACTIVATION_SAVED');
 assert.equal(core.summary().createdAccountCount,1);assert.equal(core.summary().appliedInvitationCount,1);assert.throws(()=>core.reply({...claim,phase:'COMMIT',operationId:'f'.repeat(32)}));
});
