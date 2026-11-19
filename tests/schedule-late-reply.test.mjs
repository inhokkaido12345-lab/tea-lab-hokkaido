import test from 'node:test';import assert from 'node:assert/strict';
import {managementHarness,managementSnapshot,sheetReply} from './helpers/schedule-management-harness.mjs';
function published(revision=2){const s=managementSnapshot();for(const half of Object.values(s.halves)){half.phase='PUBLISHED';half.monthRevision=revision;half.publishedAt='2026-11-19T05:00:00.000Z';}return s;}
async function saving(){const h=managementHarness();await h.api.load();await h.reply(h.sent[0],published());h.click('publish');await h.reply(h.sent[1],sheetReply(published()),'SCHEDULE_SHEET_READY');return h;}
test('late signed success confirms the current publish without another POST and persists beside the button',async()=>{
 const h=await saving(),r=h.sent[2];h.expire();assert.match(h.n('publish-result').textContent,/まだ確認できていません/);assert.doesNotMatch(h.n('publish-result').textContent,/✓/);h.click('publish');assert.equal(h.sent.length,3);
 await h.reply(r,published(3),'SCHEDULE_SAVED');assert.equal(h.sent.length,3);assert.equal(h.n('retry').hidden,true);assert.equal(h.n('publish').disabled,false);assert.match(h.n('publish-result').textContent,/2026-11 ✓ 公開しました/);assert.match(h.n('publish-result').textContent,/現在の公開版の時刻（日本時間）/);assert.match(h.n('publish-result').textContent,/PNG用データはまだ更新していません/);
 const result=h.n('publish-result').textContent;await h.reply(r,published(4),'SCHEDULE_SAVED');assert.equal(h.n('publish-result').textContent,result);h.click('refresh');assert.equal(h.n('publish-result').textContent,'');
});
test('late no-change is not falsely described as a new publication',async()=>{const h=await saving();h.expire();await h.reply(h.sent[2],published(),'SCHEDULE_READY');assert.match(h.n('publish-result').textContent,/変更はありません/);assert.doesNotMatch(h.n('publish-result').textContent,/✓ 公開しました/);});
test('explicit retry supersedes original transport; original late success cannot end new wait',async()=>{
 const h=await saving(),old=h.sent[2];h.expire();h.click('retry');const retry=h.sent[3];assert.equal(old.operationId,retry.operationId);assert.equal(old.input,retry.input);await h.reply(old,published(3),'SCHEDULE_SAVED');assert.equal(h.n('publish').disabled,true);assert.match(h.n('publish-result').textContent,/処理中/);await h.reply(retry,published(3),'SCHEDULE_ALREADY_DONE');assert.match(h.n('publish-result').textContent,/この操作の公開済み記録/);
 h.click('publish');assert.equal(h.sent[4].command,'sheetRead');await h.reply(old,published(2),'SCHEDULE_SAVED');assert.equal(h.n('publish').disabled,true);assert.match(h.n('publish-result').textContent,/公開内容を確認/);
});
test('late reply keeps origin/source/HMAC/command/month/revision checks',async()=>{
 const h=await saving(),r=h.sent[2];h.expire();await h.reply(r,published(3),'SCHEDULE_SAVED',{},'https://evil.invalid');await h.reply(r,published(3),'SCHEDULE_SAVED',{},'null',{});await h.reply(r,published(3),'SCHEDULE_SAVED',{mac:'0'.repeat(64)});await h.reply(r,published(3),'SCHEDULE_SAVED',{command:'monthPublish'});const wrong=published(3);wrong.month='2026-12';await h.reply(r,wrong,'SCHEDULE_SAVED');await h.reply(r,published(1),'SCHEDULE_SAVED');const incomplete=published(3);incomplete.halves.SECOND.publishedAt='';await h.reply(r,incomplete,'SCHEDULE_SAVED');assert.match(h.n('publish-result').textContent,/まだ確認できていません/);await h.reply(r,published(3),'SCHEDULE_SAVED');assert.match(h.n('publish-result').textContent,/✓ 公開しました/);
});
test('changed identity, store and page departure cannot revive a late result',async()=>{
 for(const mode of ['token','store','departure']){const h=await saving(),r=h.sent[2];h.expire();if(mode==='token')h.liff.getIDToken=()=> 'new.jwt.identity';if(mode==='store')h.window.TlhCurrentWorkplace={config:{organizationId:'other',workplaceId:'other',endpoint:'https://offline.invalid'}};if(mode==='departure')h.depart();await h.reply(r,published(3),'SCHEDULE_SAVED');assert.doesNotMatch(h.n('publish-result').textContent,/✓/);assert.equal(h.sent.length,3);}
});
test('late errors distinguish rolled back save from unknown outcome and keep old phase from claiming success',async()=>{
 for(const [code,pattern]of [['SCHEDULE_WRITE_UNAVAILABLE',/変更は戻されています/],['SCHEDULE_UNAVAILABLE',/応答を確認できません/],['SCHEDULE_REQUEST_PENDING',/公開していません/],['SCHEDULE_PERMISSION_REQUIRED',/管理者権限を確認できません/]]){const h=await saving();h.expire();await h.reply(h.sent[2],null,code);assert.match(h.n('publish-result').textContent,pattern);assert.doesNotMatch(h.n('publish-result').textContent,/✓/);assert.equal(h.n('retry').hidden,code!=='SCHEDULE_UNAVAILABLE');assert.equal(h.sent.length,3);}
});
test('read timeout never starts a delayed automatic publish, and new month load clears feedback',async()=>{
 const h=managementHarness();await h.api.load();await h.reply(h.sent[0],published());h.click('publish');const r=h.sent[1];h.expire();await h.reply(r,sheetReply(published()),'SCHEDULE_SHEET_READY');assert.equal(h.sent.length,2);assert.match(h.n('publish-result').textContent,/この操作では公開していません/);h.n('month').value='2026-12';await h.api.load();assert.equal(h.n('publish-result').textContent,'');
});
