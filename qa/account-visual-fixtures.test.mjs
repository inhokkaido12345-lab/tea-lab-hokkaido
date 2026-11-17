import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import fs from 'node:fs';import {fixtureReply,scenarios,replyHTML} from './account-visual-fixtures.mjs';
test('overview fixture uses actual controller action and exact signed contract',()=>{const source=fs.readFileSync(new URL('../account/access-overview.js',import.meta.url),'utf8');assert.ok(source.includes('bridgeAccountAccessOverviewV1'));for(const scenario of scenarios){const p={action:'bridgeAccountAccessOverviewV1',nonce:'a'.repeat(32),responseKey:'b'.repeat(64)},r=fixtureReply(p,scenario);if(scenario==='checking'){assert.equal(r,null);continue;}assert.equal(r.mac,createHmac('sha256',p.responseKey).update([r.type,r.phase,r.nonce,r.code,r.data].join('\n')).digest('hex'));} });
test('unknown COMMIT is withheld, never fabricated success, and HTML targets localhost',()=>{const p={action:'bridgeCommonServiceActivationV1',phase:'COMMIT',command:'CLAIM',nonce:'a'.repeat(32),responseKey:'b'.repeat(64)};assert.equal(fixtureReply(p,'unknown'),null);assert.equal(fixtureReply(p,'success').code,'COMMON_ACTIVATION_SAVED');assert.ok(replyHTML(fixtureReply(p,'success'),'http://127.0.0.1:8765').includes('"http://127.0.0.1:8765"'));assert.throws(()=>fixtureReply({...p,action:'live-write'},'success'));});

import vm from 'node:vm';
import {collectViewportButtons} from './account-visual-fixtures.mjs';
test('viewport button metric excludes closed details, CSS hidden and offscreen controls',()=>{
 const button=(id,extra={})=>({id,textContent:' '+id+' ',disabled:false,parentElement:null,checkVisibility:()=>true,getBoundingClientRect:()=>({left:10,top:10,right:110,bottom:60,width:100,height:50}),...extra});
 const closed={tagName:'DETAILS',open:false,children:[],parentElement:null};
 const nested={tagName:'DIV',parentElement:closed};
 const summaryButton=button('summary');closed.children=[{tagName:'SUMMARY',contains:e=>e===summaryButton}];summaryButton.parentElement=closed;
 const buttons=[button('shown'),button('closed',{parentElement:closed}),button('nested',{parentElement:nested}),summaryButton,
 button('hidden',{checkVisibility:()=>false}),button('below',{getBoundingClientRect:()=>({left:10,top:844,right:110,bottom:894,width:100,height:50})}),
 button('left',{getBoundingClientRect:()=>({left:-100,top:10,right:0,bottom:60,width:100,height:50})}),
 button('partial',{getBoundingClientRect:()=>({left:380,top:830,right:480,bottom:880,width:100,height:50})}),
 button('open-details',{parentElement:{...closed,open:true}})];
 const actual=vm.runInNewContext('('+collectViewportButtons.toString()+')()', {document:{querySelectorAll:()=>buttons},innerWidth:390,innerHeight:844});
 assert.deepEqual(Array.from(actual,x=>x.id),['shown','summary','partial','open-details']);
});
