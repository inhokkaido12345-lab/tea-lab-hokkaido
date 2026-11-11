/**
 * UI1の全controller+実HTMLのID契約を偽DOM/偽LIFFで検査。Googleへ接続しない。
 * HTMLからID/pane fixture→既存全script/起動→tab/拒否応答。削除時は配置替えによるDOM欠落を見逃す。
 * 暗号はNode標準を使用。見た目/実LINEの成功は別途確認する。改造はlayout/HTML/READMEを同期。
 */
import test from 'node:test';
import {sampleAccountInfo} from './helpers/account-info-harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';

const html = fs.readFileSync(new URL('../software/worktime/index.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../workforce/layout.js', import.meta.url), 'utf8');
async function harness({ loggedIn = true, proof = 'fake.jwt.proof', inClient = true, initFailure = false, loginFailure = false } = {}) {
  const loginCalls=[];let reloads=0;
  const nodes = new Map(), panes = [], handlers = {}, sent = [], wire = [], timers = new Map(); let timer = 0, focused = '';
  const observers=new Set();class Observer{constructor(fn){this.fn=fn;}observe(n){this.node=n;observers.add(this);}disconnect(){observers.delete(this);}}
  // 既知の二重引用ID属性をfixtureにするだけ。HTML構文/親子関係/描画の検証ではない。
  for (const match of html.matchAll(/<[a-z][a-z0-9-]*\b([^<>]*\bid="([^"]+)"[^<>]*)>/gi)) {
    const attrs = match[1], id = match[2]; assert.ok(!nodes.has(id), 'duplicate DOM id: ' + id);
    const pane = attrs.match(/data-workforce-pane="([^"]+)"/);
    const node = { id, hidden: /\bhidden\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), value: '', textContent: '', events: {}, contentWindow:{},
      dataset: pane ? { workforcePane: pane[1] } : {}, attributes: {},classList:{toggle(){}},after(){},
      addEventListener(type, fn) { this.events[type] = fn; },
      setAttribute(name, value) { this.attributes[name] = value;for(const o of observers)if(o.node===this)queueMicrotask(()=>{if(observers.has(o))o.fn();}); },getAttribute(name){return this.attributes[name]??null;},click(){if(!this.disabled)this.events.click?.();},children:[],replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);}, querySelectorAll(){return [];},removeAttribute(name){delete this.attributes[name];},focus() { focused = id; } };
    nodes.set(id, node); if (pane) panes.push(node);
  }
  const node = id => { assert.ok(nodes.has(id), 'missing actual DOM id: ' + id); return nodes.get(id); };
  node('journal-mode').value='self'; // 実HTMLの唯一のoptionが初期選択される。
  const diagnostics = { open: false };
  const context = { crypto: webcrypto, Uint8Array, TextEncoder, URL,MutationObserver:Observer,
    location: { href:'https://tealabhokkaido.com/software/worktime/',origin: 'https://tealabhokkaido.com', pathname: '/software/worktime/',reload(){reloads++;} },
    confirm: () => false,
    liff: { init: async () => {if(initFailure)throw Error('fixture init failure');}, isLoggedIn: () => loggedIn, isInClient: () => inClient, getIDToken: () => proof,
      login(options){loginCalls.push(JSON.parse(JSON.stringify(options)));if(loginFailure)throw Error('fixture login failure');} },
    setTimeout(fn) { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    document: { getElementById: node,
      querySelectorAll(selector) { if(selector==='[role="status"], [id$="-status"]')return [...nodes.values()].filter(n=>n.id.endsWith('-status'));if(['[data-approval-badge]','[data-current-workplace]'].includes(selector))return [];assert.equal(selector, '[data-workforce-pane]'); return panes; },
      querySelector(selector) { assert.equal(selector, '.diagnostics'); return diagnostics; },
      body: { appendChild() {} }, createElement() { return { children: [],getAttribute(k){return this[k];},
        appendChild(child) { this.children.push(child); }, remove() {},
        submit() { const request=Object.fromEntries(this.children.map(child=>[child.name,child.value]));wire.push(request);if(request.action==='bridgeReadHomeV1')sent.push(...JSON.parse(request.requests));else sent.push(request); } }; } },
    fetch() { throw Error('unexpected network'); },
  };
  context.window = context; context.top = context;
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)(?:\?[^"]*)?"[^>]*><\/script>/g)) {
    if (match[1].startsWith('https:')) continue;
    const localPath=match[1].startsWith('/')?'..'+match[1]:'../workforce/'+match[1];
    vm.runInNewContext(fs.readFileSync(new URL(localPath, import.meta.url), 'utf8'), context);
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; assert.equal(inline.length, 1);
  vm.runInNewContext(inline[0][1], context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, panes, context, diagnostics, sent, wire, timers,loginCalls,reloads:()=>reloads, focused: () => focused,
    depart(){for(const fn of handlers.pagehide||[])fn();},
    click(id) { node(id).events.click(); },
    key(id, key) { let prevented = false; node(id).events.keydown({ key, preventDefault() { prevented = true; } }); return prevented; },
    async replyAccess(code='STAFF_ADMIN_READY',punchCode='PUNCH_DISABLED') {
      const batch=wire.find(r=>r.action==='bridgeReadHomeV1');if(!batch)return;
      const replies=JSON.parse(batch.requests).map(r=>{
        const data={type:r.action==='bridgeCheckStaffEnrollment'?'TLH_BRIDGE_STAFF_ENROLLMENT':r.action==='bridgeGetPunchReadiness'?'TLH_BRIDGE_PUNCH':'TLH_BRIDGE_ATTENDANCE_JOURNAL',nonce:r.nonce,action:r.action,
          code:r.action==='bridgeCheckStaffEnrollment'?code:r.action==='bridgeGetPunchReadiness'?punchCode:'JOURNAL_UNAVAILABLE'};
        if(r.action==='bridgeGetPunchReadiness')data.revision='';if(r.action==='bridgeGetAttendanceJournalV2')data.journal='';
        data.mac=createHmac('sha256',r.responseKey).update(Object.values(data).join('\n')).digest('hex');return data;
      });
      const data={type:'TLH_BRIDGE_READ_HOME_V1',nonce:batch.nonce,action:batch.action,code:'READ_HOME_READY',replies:JSON.stringify(replies)};
      data.mac=createHmac('sha256',batch.responseKey).update(Object.values(data).join('\n')).digest('hex');
      for(const fn of handlers.message)await fn({origin:'null',source:node('home-read-frame').contentWindow,data});
      // Await the actual WebCrypto completion, not a machine-speed-dependent number of event-loop turns.
      const deadline=Date.now()+2000;while(['admin-access-status','punch-status','journal-status'].some(id=>node(id).getAttribute('aria-busy')==='true')){assert.ok(Date.now()<deadline,'startup child verification did not settle');await new Promise(resolve=>setTimeout(resolve,1));}
      await new Promise(resolve=>setImmediate(resolve));
    },
    async replyAccount(code='ACCOUNT_INFO_READY'){
      const request=sent.findLast(r=>r.action==='bridgeGetAccountInfo'),data={type:'TLH_BRIDGE_ACCOUNT_INFO',action:request.action,nonce:request.nonce,code,info:code==='ACCOUNT_INFO_READY'?JSON.stringify(sampleAccountInfo()):''};
      data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,data.code,data.info].join('\n')).digest('hex');
      for(const fn of handlers.message)await fn({origin:'null',source:node('account-info-frame').contentWindow,data});
      await new Promise(resolve=>setImmediate(resolve));
    },
    async replyJournalError(){
      const request=sent.findLast(r=>r.action==='bridgeGetAttendanceJournalV2'),data={type:'TLH_BRIDGE_ATTENDANCE_JOURNAL',action:request.action,nonce:request.nonce,code:'JOURNAL_UNAVAILABLE',journal:''};
      data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,data.code,data.journal].join('\n')).digest('hex');
      for(const fn of handlers.message)await fn({origin:'null',source:node('journal-frame').contentWindow,data});
      await new Promise(resolve=>setImmediate(resolve));
    },
  };
}

test('startup makes one POST for role, punch and today; employee denial keeps management closed',async()=>{
 const h=await harness();assert.equal(h.wire.length,1);assert.equal(h.wire[0].action,'bridgeReadHomeV1');
 assert.deepEqual(h.sent.map(r=>r.action),['bridgeCheckStaffEnrollment','bridgeGetPunchReadiness','bridgeGetAttendanceJournalV2']);
 assert.equal(h.node('manager-tab').disabled,true);await h.replyAccess('TLH_ADMIN_REQUIRED');assert.equal(h.wire.length,1);
 assert.equal(h.node('manager-tab').disabled,true);assert.equal(h.node('punch-status').textContent,'打刻受付は停止中です。');
 assert.equal(h.node('journal-status').attributes['aria-busy'],'false');
 for(const id of ['punch-in','punch-out','punch-break-start','punch-break-end'])assert.equal(h.node(id).hidden,true);
});
test('admin overview waits for the startup batch; timeout closes management and never retries writes',async()=>{
 const h=await harness();await h.replyAccess();assert.equal(h.wire.length,2);assert.equal(h.wire[1].action,'bridgeGetAdminOverview');
 const failed=await harness();for(const fn of [...failed.timers.values()])fn();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(failed.node('manager-tab').disabled,true);assert.equal(failed.wire.length,1);assert.ok(failed.sent.every(r=>r.action!=='bridgeRecordPunch'));
});

test('More tab loads own account inline once, reuses its result on return, and refreshes only by request',async()=>{
 const h=await harness();assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,0);
 h.click('more-tab');await h.replyAccess();
 assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,1);assert.equal(h.node('account-info-status').attributes['aria-busy'],'true');
 h.click('account-info-check');assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,1);
 await h.replyAccount();assert.equal(h.node('account-info-result').hidden,false);assert.match(h.node('account-info-fields').children.map(n=>n.textContent).join(' '),/INFO001/);
 h.click('employee-tab');h.click('more-tab');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,1);
 h.click('account-info-check');assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,2);h.depart();await h.replyAccount();
 assert.equal(h.node('account-info-result').hidden,true);assert.equal(h.node('account-info-fields').children.length,0);
});

test('More tab account failure offers a manual refresh without retry loops or enabling management',async()=>{
 const h=await harness();h.click('more-tab');await h.replyAccess('TLH_ADMIN_REQUIRED');await h.replyAccount('ACCOUNT_INFO_UNAVAILABLE');
 assert.equal(h.node('account-info-result').hidden,true);assert.equal(h.node('account-info-check').disabled,false);assert.equal(h.node('manager-tab').disabled,true);
 h.click('employee-tab');h.click('more-tab');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent.filter(r=>r.action==='bridgeGetAccountInfo').length,1);
});

test('external first launch offers explicit LINE login without loops, saved tokens, or business requests',async()=>{
  const h=await harness({loggedIn:false,inClient:false});
  assert.equal(h.node('home-line-login').hidden,false);assert.equal(h.node('home-line-login').disabled,false);
  assert.equal(h.node('workforce-tabs').hidden,true);assert.equal(h.sent.length,0);assert.equal(h.loginCalls.length,0);
  h.context.location.search='?code=private';h.context.location.hash='#private';
  h.click('home-line-login');h.click('home-line-login');
  assert.deepEqual(h.loginCalls,[{redirectUri:'https://tealabhokkaido.com/software/worktime/'}]);
  assert.equal(h.sent.length,0);assert.equal(h.node('home-line-login').disabled,true);
  h.depart();h.click('home-line-login');assert.equal(h.loginCalls.length,1);
});

test('login return uses normal startup; SDK failure and LIFF-internal state never offer unsupported login',async()=>{
  const returned=await harness({inClient:false});
  assert.equal(returned.node('home-line-login').hidden,true);assert.equal(returned.loginCalls.length,0);
  assert.equal(returned.wire[0].action,'bridgeReadHomeV1');
  assert.equal(returned.sent.length,3);assert.equal(returned.node('manager-tab').disabled,true);await returned.replyAccess('TLH_ADMIN_REQUIRED');assert.equal(returned.wire.length,1);
  for(const options of [{loggedIn:false,inClient:true},{loggedIn:false,inClient:false,initFailure:true}]){
    const h=await harness(options);assert.equal(h.node('home-line-login').hidden,true);h.click('home-line-login');assert.equal(h.loginCalls.length,0);assert.equal(h.sent.length,0);
  }
  const failed=await harness({loggedIn:false,inClient:false,loginFailure:true});failed.click('home-line-login');
  assert.equal(failed.node('home-line-login').disabled,false);assert.equal(failed.sent.length,0);
});
test('tabs change only wrapper visibility, not permissions, pending values, command visibility or form content', async () => {
  const h = await harness();await h.replyAccess(); h.node('staff-issued-code').value = 'fake-private-draft'; h.node('staff-check').disabled = true;
  h.node('staff-status').textContent = '処理中です。';
  for (let count = 0; count < 3; count++) { h.click('manager-tab'); h.click('employee-tab'); }
  h.click('manager-tab');h.click('manager-employees-choice'); assert.equal(h.node('manager-registration-panel').hidden, false);
  assert.equal(h.node('employee-registration-panel').hidden, true); assert.equal(h.node('staff-admin').hidden, true);
  assert.equal(h.node('staff-issued-code').value, 'fake-private-draft'); assert.equal(h.node('staff-check').disabled, true);
  assert.equal(h.node('staff-status').textContent, '処理中です。'); assert.equal(h.sent.length,4);assert.equal(h.sent[3].action,'bridgeGetAdminOverview');
});
test('arrow/Home/End navigation maintains selected tab, focus and tab stop; other keys are untouched', async () => {
  const h = await harness();await h.replyAccess(); assert.equal(h.key('employee-tab', 'ArrowRight'), true); assert.equal(h.focused(), 'records-tab');
  assert.equal(h.node('records-tab').attributes['aria-selected'], 'true'); assert.equal(h.node('employee-tab').tabIndex, -1);
  assert.equal(h.key('manager-tab', 'Home'), true); assert.equal(h.focused(), 'employee-tab');
  assert.equal(h.key('employee-tab', 'End'), true); assert.equal(h.focused(), 'more-tab');
  assert.equal(h.key('more-tab', 'ArrowRight'), true); assert.equal(h.focused(), 'employee-tab');
  assert.equal(h.key('employee-tab', 'ArrowLeft'), true); assert.equal(h.focused(), 'more-tab');
  assert.equal(h.key('manager-tab', 'Tab'), false);
});
test('four destinations expose only their wrappers and queue lazy reads without duplicating pending requests', async () => {
  const h = await harness();await h.replyAccess();
  h.click('records-tab');assert.equal(h.node('records-work-panel').hidden,false);assert.equal(h.node('employee-work-panel').hidden,true);
  h.click('more-tab');assert.equal(h.node('employee-registration-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,false);
  assert.equal(h.node('manager-registration-panel').hidden,true);assert.equal(h.node('records-work-panel').hidden,true);
  h.click('manager-tab');assert.equal(h.node('manager-tools-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,true);
  assert.equal(h.sent.length,4);assert.equal(h.sent[3].action,'bridgeGetAdminOverview');
});

test('developer demo also separates manager issue/release from personal invitation claim',async()=>{
  const h=await harness();await h.replyAccess();h.click('manager-tab');assert.equal(h.node('manager-test-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,true);
  const admin=html.slice(html.indexOf('<div id="manager-test-panel"'),html.indexOf('<div id="more-tools-panel"'));
  assert.match(admin,/id="demo-issue"/);assert.match(admin,/id="demo-release"/);assert.doesNotMatch(admin,/id="demo-claim"/);
  const personal=html.slice(html.indexOf('<section id="personal-demo-panel"'),html.indexOf('<section class="card" aria-live="polite">',html.indexOf('<section id="personal-demo-panel"')));
  assert.match(personal,/id="demo-claim"/);assert.doesNotMatch(personal,/id="demo-(?:issue|release)"/);
  h.click('more-tab');assert.equal(h.node('manager-test-panel').hidden,true);assert.equal(h.node('more-tools-panel').hidden,false);assert.equal(h.sent.length,4);
});
test('missing login or proof keeps business sections and nav closed, while diagnostics remain accessible', async () => {
  for (const options of [{ loggedIn: false }, { proof: '' }]) {
    const h = await harness(options); assert.equal(h.node('workforce-tabs').hidden, true);
    assert.equal(h.node('punch-section').hidden, true); assert.equal(h.diagnostics.open, true); assert.equal(h.sent.length, 0);
    h.click('manager-tab'); assert.equal(h.node('staff-section').hidden, true); assert.equal(h.node('maintenance-section').hidden, true);
  }
});
test('signed closed reception in startup stays closed through view changes and sends no punch',async()=>{
 const h=await harness();await h.replyAccess('TLH_ADMIN_REQUIRED');h.click('manager-tab');h.click('employee-tab');
 assert.equal(h.node('punch-status').textContent,'打刻受付は停止中です。');
 for(const id of ['punch-in','punch-out','punch-break-start','punch-break-end'])assert.equal(h.node(id).hidden,true);
 assert.equal(h.wire.length,1);assert.equal(h.sent.length,3);
});

test('layout source cannot send, store, authorize, expose secret values or overwrite controller controls', () => {
  assert.ok(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|liff|crypto|submit|confirm)\s*[.(]/.test(layout));
  assert.ok(!/\.value\s*=|\.textContent\s*=/.test(layout));
  assert.match(layout,/tab\.disabled=!adminAllowed/);
  assert.ok(html.indexOf('id="punch-section"') < html.indexOf('id="daily-summary-section"'));
  assert.ok(html.indexOf('id="work-state-section"') > html.indexOf('<details class="diagnostics">'));
  assert.match(html, /id="staff-issued-code"[^>]*readonly/);
});
test('employee cannot click or keyboard into management and a thousand tab attempts send no extra requests',async()=>{
  const h=await harness();await h.replyAccess('TLH_ADMIN_REQUIRED');
  for(let i=0;i<1000;i++){h.click('manager-tab');h.key('records-tab','ArrowRight');}
  assert.equal(h.node('manager-tab').disabled,true);assert.equal(h.node('manager-tools-panel').hidden,true);
  assert.equal(h.node('manager-registration-panel').hidden,true);assert.equal(h.node('admin-demo-panel').hidden,true);
  assert.equal(h.focused(),'schedule-tab');assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.sent.length,3);
});

test('employee shift and management shift remain separate even for an authorized manager',async()=>{
 const h=await harness();h.click('schedule-tab');assert.equal(h.node('schedule-work-panel').hidden,false);assert.equal(h.node('schedule-admin-entry').hidden,true);
 await h.replyAccess();assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.node('manager-schedule-panel').hidden,true);
 h.click('manager-tab');assert.equal(h.node('manager-attendance-panel').hidden,false);assert.equal(h.node('schedule-admin-entry').hidden,true);
 h.click('manager-schedule-choice');assert.equal(h.node('manager-schedule-panel').hidden,false);assert.equal(h.node('schedule-admin-entry').hidden,false);assert.equal(h.node('schedule-work-panel').hidden,true);
 h.click('schedule-tab');assert.equal(h.node('schedule-work-panel').hidden,false);assert.equal(h.node('schedule-admin-entry').hidden,true);
 const employee=html.slice(html.indexOf('<!-- schedule-workspace:start -->'),html.indexOf('<!-- schedule-workspace:end -->'));
 const manager=html.slice(html.indexOf('<!-- schedule-management:start -->'),html.indexOf('<!-- schedule-management:end -->'));
 for(const id of ['schedule-calendar','schedule-editor','schedule-request-deadline'])assert.match(employee,new RegExp('id="'+id+'"'));
 for(const id of ['schedule-management-sheet-create','schedule-management-requests','schedule-management-deadline-save','schedule-management-publish']){assert.doesNotMatch(employee,new RegExp('id="'+id+'"'));assert.match(manager,new RegExp('id="'+id+'"'));}
 assert.doesNotMatch(manager,/id="schedule-editor"|id="schedule-request-deadline"/);
});

test('leaving closes the shift administration entry; late authorization cannot reopen it',async()=>{
 const h=await harness();await h.replyAccess();h.click('manager-tab');h.click('manager-schedule-choice');assert.equal(h.node('schedule-admin-entry').hidden,false);
 h.depart();assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.node('manager-tab').disabled,true);const before=h.sent.length;
 await h.replyAccess();h.click('manager-tab');assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.sent.length,before);
});

test('management categories retain inputs and pending state, hide unrelated forms and never send extra requests',async()=>{
 const h=await harness();await h.replyAccess();h.click('manager-tab');const before=h.sent.length;
 assert.equal(h.node('manager-attendance-panel').hidden,false);assert.equal(h.node('manager-registration-panel').hidden,true);
 h.node('staff-name').value='保持する架空名';h.node('staff-status').textContent='処理中です。';h.node('staff-check').disabled=true;
 for(let i=0;i<20;i++){h.click('manager-employees-choice');h.click('manager-attendance-choice');}
 h.click('manager-employees-choice');assert.equal(h.node('manager-registration-panel').hidden,false);assert.equal(h.node('manager-maintenance-panel').hidden,false);assert.equal(h.node('manager-attendance-panel').hidden,true);assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.node('staff-status-host').hidden,false);
 assert.equal(h.node('staff-name').value,'保持する架空名');assert.equal(h.node('staff-status').textContent,'処理中です。');assert.equal(h.node('staff-check').disabled,true);assert.equal(h.sent.length,before);
 h.click('more-tab');h.click('manager-tab');assert.equal(h.node('manager-registration-panel').hidden,false);assert.equal(h.node('manager-employees-choice').attributes['aria-pressed'],'true');
});
test('management choices stay closed for employees; labor review has a separate page',async()=>{
 const h=await harness();await h.replyAccess('TLH_ADMIN_REQUIRED');for(const name of ['employees','attendance','schedule']){assert.equal(h.node('manager-'+name+'-choice').disabled,true);h.click('manager-'+name+'-choice');}
 assert.equal(h.node('schedule-admin-entry').hidden,true);assert.equal(h.node('manager-registration-panel').hidden,true);assert.equal(h.sent.length,3);
 assert.doesNotMatch(html,/id="labor-policy-section"|laborPolicyUi|src="labor-policy.js/);assert.ok(html.includes('href="/software/worktime/labor-policy.html"'));
});

test('employee shift activation cannot reveal or request administrator controls',async()=>{const h=await harness();await h.replyAccess('TLH_ADMIN_REQUIRED');h.click('schedule-tab');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.node('schedule-admin-entry').hidden,true);assert.ok(!h.wire.some(r=>r.action==='bridgeScheduleV1'&&JSON.parse(r.input).audience==='admin'));});
