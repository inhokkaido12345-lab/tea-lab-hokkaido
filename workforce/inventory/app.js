/**
 * 連結画面：fetchで同一originのAPIへ送信し、返ってきた保存結果を再読取して表示。
 * 状態はサーバーが正本。DOMの数量を直接加算しない。
 * 概念：DTO/再送ID/通信結果不明。改造：行フォームはaddLine、描画はrender。
 * tokenはメモリだけ。入力やエラーにinnerHTMLを使わない。ローカル専用で本番認証はない。
 * 削除すると連結画面の操作が停止。検証はHTTP試験とREADMEのブラウザ操作手順。
 */
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
let view=null,filter='all',pending=null,busy=false;
// 1回の描画中の品目検索を索引にする。サーバーの在庫の代わりには使わない。
let itemsById = new Map();
// Intlの設定解析を毎回繰り返さず、表示専用フォーマッターを再利用する。
const quantityFormatter = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 3});
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const quantities = grams => quantityFormatter.format(grams / 1000) + ' kg';
const formatRecordedAt = value => value ? dateFormatter.format(new Date(value)) : '算出前';
const message=t=>{$('status').textContent=t;};
/** 通信中・読込未完了・結果不明を分ける。失敗後の再読取は必ず押せるようにする。 */
function lock(value){busy=value;for(const b of document.querySelectorAll('button,input,select')){
 const recovery=['retry','refresh','line-login'].includes(b.id);
 b.disabled=value||(!view&&!recovery&&!b.dataset.tab)||(Boolean(pending)&&!recovery);
}}
function tab(name){for(const s of document.querySelectorAll('main section'))s.hidden=s.id!==name;for(const b of document.querySelectorAll('nav button')){if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
/** 取得できるまで古い残量からの新規更新を禁止する。結果不明の操作IDは保持する。 */
async function load(){
 view=null;
 const result = await TlhInventory.request('READ');
 if (!result.ok) throw Error(result.code || 'UNAVAILABLE');view=result.value;render();
}
// 状態文言は1か所に置き、品目ごとのオブジェクト再作成を避ける。
const forecastMessages = {
  NEEDS_COUNT: '棚卸の基準値を登録してください',
  LEARNING: '消費速度を学習中：使い切り実績が必要です',
  REVIEW_STOCK: '入荷漏れ・棚卸基準値を確認してください',
  AWAITING_OPEN: '次の開封待ち（欠品・休止中は日数に含めません）',
  OUT_OF_STOCK: '在庫切れ',
  CHECK_STAMP: '予測上の袋交換日を過ぎています。打刻・残量を確認してください',
  NEEDS_LEAD_TIME: '到着日数を設定してください',
  ORDER_NOW: '発注期限に達しています',
  OK: '発注期限まで余裕があります',
};

/** 数字入力の共通部品。値の最終検証は保存時にサーバー側でも行う。 */
function appendNumberField(container, label, value) {
  const wrapper = el('label', label);
  const input = el('input', '');
  input.type = 'number';
  input.min = '0';
  input.step = 'any';
  input.value = value;
  input.setAttribute('aria-label', label);
  wrapper.append(input);
  container.append(wrapper);
  return input;
}

function renderConsumptionSettings(container, item) {
  const forecast = item.forecast;
  const quantity = appendNumberField(container, '棚卸の総在庫（g、開封中の残量も含む）', '');
  const remaining = appendNumberField(container, 'そのうち開封中の残量（g、未開封なら0）', forecast.open ? '' : '0');
  const count = el('button', '実数で補正');
  count.onclick = () => {
    if (quantity.value === '' || remaining.value === '') {
      message('棚卸の数量を入力してください');
      return;
    }
    send({type: 'COUNT_STOCK', itemId: item.id,
      quantity: Number(quantity.value), openRemaining: Number(remaining.value)});
  };
  container.append(count);
  const lead = appendNumberField(container, '発注から到着まで（日）', forecast.config?.leadDays ?? '');
  const safety = appendNumberField(container, '安全余裕（日）', forecast.config?.safetyDays ?? '1');
  const save = el('button', '到着日数を保存');
  save.onclick = () => {
    if (lead.value === '' || safety.value === '') {
      message('到着日数と安全余裕を入力してください');
      return;
    }
    send({type: 'SET_FORECAST', itemId: item.id,
      leadDays: Number(lead.value), safetyDays: Number(safety.value)});
  };
  container.append(save);
}

/** 品目カード内で完結させ、袋交換は終了と次の開始を1回の保存にする。 */
function renderConsumption(card, item) {
  const forecast = item.forecast;
  const unit = item.units[0];
  card.append(el('h4', '棚卸間の消費推定'),
    el('p', forecastMessages[forecast.status] || forecast.status,
      forecast.status === 'ORDER_NOW' ? 'badge low' : 'muted'));
  if (forecast.quantity !== null) {
    card.append(el('p', '推定残量 ' + quantities(forecast.quantity) + ' ／基準 ' + formatRecordedAt(forecast.countedAt)));
  }
  if (forecast.rate) {
    card.append(el('p', '実績 ' + forecast.sampleCount + '袋 ／平均 ' +
      (unit.baseQuantity / forecast.averageRate).toFixed(1) + '日/袋 ／直近 ' +
      (unit.baseQuantity / forecast.recentRate).toFixed(1) + '日/袋'));
    card.append(el('p', '直近/平均の消費速度 ' + forecast.relativeSpeed.toFixed(2) + '倍 ／警告には速い方を採用'));
  }
  card.append(el('p', '推定在庫切れ ' + formatRecordedAt(forecast.stockoutAt)),
    el('p', '発注期限 ' + formatRecordedAt(forecast.orderBy)));
  if ((item.orders || []).length) {
    card.append(el('p', '発注済みあり。到着までの欠品を確認してください（未入荷は推定残量に含みません）', 'muted'));
  }
  if (!view.permissions.includes('inventory.receive')) return;

  const select = el('select', '');
  select.setAttribute('aria-label', '開封する袋の単位');
  const unitsById = new Map(item.units.map(value => [value.id, value]));
  for (const value of item.units) {
    select.append(new Option(value.label + ' ' + quantities(value.baseQuantity), value.id));
  }
  const command = type => {
    const selected = unitsById.get(select.value);
    return {type, itemId: item.id,
      ...(type === 'OPEN_PACK' || type === 'NEXT_PACK'
        ? {unitId: selected.id, conversionVersion: selected.version} : {}),
      ...(forecast.open ? {openOperationId: forecast.open.operationId} : {})};
  };
  card.append(select);
  if (forecast.open) {
    card.append(el('p', '開封 ' + formatRecordedAt(forecast.open.openedAt)));
    const next = el('button', '使い切って次を開封', 'primary');
    next.onclick = () => send(command('NEXT_PACK'));
    const finish = el('button', '使い切りのみ');
    finish.onclick = () => send(command('FINISH_PACK'));
    card.append(next, finish);
  } else {
    const open = el('button', '1袋を開封', 'primary');
    open.onclick = () => send(command('OPEN_PACK'));
    card.append(open);
  }
  const details = el('details', '');
  details.append(el('summary', '棚卸で補正・到着日数を設定'));
  // 開くまで入力欄とハンドラーを作らない。再度開いても入力値を残す。
  let mounted = false;
  details.ontoggle = () => {
    if (!details.open || mounted) return;
    mounted = true;
    renderConsumptionSettings(details, item);
    // 通信中や保存結果不明の間に設定を開いても、新しい入力欄を有効化しない。
    lock(busy);
  };
  card.append(details);
}

function render(){
 itemsById = new Map(view.items.map(item => [item.id, item]));
 $('cards').replaceChildren();
 for(const item of view.items.filter(i=>filter==='all'||filter==='low'&&(i.quantity<=i.threshold||['ORDER_NOW','OUT_OF_STOCK','CHECK_STAMP','REVIEW_STOCK'].includes(i.forecast?.status))||filter==='ordered'&&(i.orders||[i.order]).some(o=>o?.status==='ORDERED'))){
 const c=el('article','','card');c.append(el('h3',item.name),el('span',item.forecast?'記録上の残量':item.quantity<=item.threshold?'要発注':'数量に余裕',item.quantity<=item.threshold?'badge low':'badge'),el('p',item.forecast?.countedAt?quantities(item.quantity):'初回棚卸未登録','qty'),el('p','危険数量 '+quantities(item.threshold)+' ／開封中の推定消費は下段に表示','muted'));
 if(item.forecast)renderConsumption(c,item);
 const orders=item.orders||(item.order?[item.order]:[]);
 for(const order of orders.filter(o=>o.status==='ORDERED')){
 c.append(el('p',order.actor+'が発注済み'+(order.at?' '+formatRecordedAt(order.at) :'')));
 if(!order.plannedLine)c.append(el('p','発注数量：未記入'));
 c.append(el('p','到着予定日：'+(order.expectedOn||'不明')));
 if(order.plannedLine)c.append(el('p','発注数量 '+order.plannedLine.quantity+' '+(item.units.find(u=>u.id===order.plannedLine.unitId)?.label||order.plannedLine.unitId)+'（'+quantities(order.plannedLine.amount)+'）'));
 }
 if(view.permissions.includes('inventory.order')){
 const b=el('button','発注を記録','primary');
 b.onclick=()=>{
  // 確認を先に済ませてから入力欄を作る。拒否した場合は画面も保存状態も変更しない。
  const notLow=item.quantity>item.threshold;
  if(notLow&&!confirm(item.name+'：要発注ではありませんが、発注しますか？'))return;
  b.disabled=true;
  const box=el('div','','line'),row=addLine(item.id,box,true);
  const dateLabel=el('label','到着予定日（任意）'),date=el('input','');
  date.type='date';date.setAttribute('aria-label','到着予定日（任意）');dateLabel.append(date);box.append(dateLabel);
  const save=el('button','発注済みにする','primary');
  save.onclick=()=>{
   const line=row.requestLine();
   if(line&&(!Number.isSafeInteger(line.quantity)||line.quantity<1)){message('発注数量を確認してください。');return;}
   if(date.value&&!/^\d{4}-\d{2}-\d{2}$/.test(date.value)){message('到着予定日を確認してください。');return;}
   send({type:'MARK_ORDERED',itemId:item.id,...(line?{line}:{}),...(date.value?{expectedOn:date.value}:{}),...(notLow?{confirmNotLow:true}:{})});
  };
  box.append(save);c.append(box);
 };c.append(b);}
 const b=el('button','入荷を登録');b.onclick=()=>{$('lines').replaceChildren();addLine(item.id);tab('receiving');};c.append(b);$('cards').append(c);
 }
 $('complete').replaceChildren(new Option('選択しない',''));
 // 受取完了は注文ごと。一件を完了しても他の未入荷注文を残す。
 for(const i of view.items)for(const o of (i.orders||(i.order?[i.order]:[])).filter(o=>o.status==='ORDERED'))$('complete').append(new Option(i.name+' ／ '+(o.at?formatRecordedAt(o.at):'発注')+' ／ '+(o.plannedLine?o.plannedLine.quantity+' '+(i.units.find(u=>u.id===o.plannedLine.unitId)?.label||o.plannedLine.unitId):'数量未記入')+' ／ 到着 '+(o.expectedOn||'不明')+' ／ '+o.id,o.id));
 $('logs').replaceChildren();
 for(const log of view.history){const names={RECEIVE:'入荷',MARK_ORDERED:'発注済み記録',CANCEL_ORDERED:'発注済みの取消し',COMPLETE_CASE:'受取完了'};const row=el('article','','line');row.append(el('p',names[log.type]||'記録'),el('p',formatRecordedAt(log.at),'muted'));for(const l of log.lines){const i=itemsById.get(l.itemId);row.append(el('p',(i?.name||'品目')+' '+quantities(l.amount)));}$('logs').append(row);}
 if(!view.history.length)$('logs').append(el('p','まだ記録はありません。','muted'));
}
/** 一品目一行。単位/換算版を読み取った値で送り、サーバー側で再検証する。 */
function addLine(itemId,container=$('lines'),ordering=false){
 const row=el('div','','line');const item=el('select','');item.setAttribute('aria-label','入荷品目');
 for(const i of view.items.filter(i=>!ordering||i.id===itemId))item.append(new Option(i.name,i.id));
 if(itemId)item.value=itemId;
 const count=el('input','');count.type='number';count.min='1';count.max='1000';count.step='1';count.value=ordering?'':'1';count.required=!ordering;count.placeholder=ordering?'未記入でも可':'';count.setAttribute('aria-label',ordering?'発注数量（任意）':'入荷数量');
 const unit=el('select','');unit.setAttribute('aria-label','入荷単位');const hint=el('p','','muted');
 const updateHint=()=>{const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);if(ordering&&count.value===''){hint.textContent='発注数量：未記入';return;}hint.textContent='見本：1'+u.label+' '+quantities(u.baseQuantity)+(ordering?' ／発注量 ':' ／加算 ')+quantities(Number(count.value)*u.baseQuantity);};
 const updateUnit=()=>{const i=itemsById.get(item.value);unit.replaceChildren();for(const u of i.units)unit.append(new Option(u.label,u.id));updateHint();};
 item.onchange=updateUnit;unit.onchange=updateHint;count.oninput=updateHint;updateUnit();
 const remove=el('button','この行を削除');remove.type='button';remove.onclick=()=>row.remove();
 row.append(item,count,unit,hint);if(!ordering)row.append(remove);row.requestLine=()=>{if(ordering&&count.value.trim()==='')return null;const i=itemsById.get(item.value),u=i.units.find(x=>x.id===unit.value);return {itemId:i.id,quantity:Number(count.value),unitId:u.id,conversionVersion:u.version};};container.append(row);return row;
}
const errors={ORDER_CONFIRMATION_REQUIRED:'在庫が更新され要発注ではなくなりました。再度確認して記録してください。',ORDER_CHANGED:'発注内容が更新されました。最新の記録を確認してください。',NOT_ORDERED:'この記録は既に取り消されています。',CASE_CLOSED:'この発注は受取完了しています。',ALREADY_ORDERED:'他の発注済み記録があります。最新状態を確認してください。',CONVERSION_CHANGED:'単位換算が更新されています。再読取してください。',INVALID_COMPLETION:'受取完了の発注と入荷品目が一致しません。',FORBIDDEN:'操作権限を確認できません。',INVALID_LINE:'品目の重複や数量を確認してください。',FUTURE_RECEIPT:'届いた日には今日以前を指定してください。'};
/** 通信失敗なら操作IDを保持し、同じ要求だけ再送する。成功後は必ずサーバーを再読取。 */
async function send(command){
 if(busy||(!view&&!pending))return;
 if(pending&&command)return;
 if(command)pending={...command,operationId:crypto.randomUUID(),storeId:view.storeId};
 if(!pending)return;
 lock(true);$('recovery').hidden=true;message('保存結果を確認しています…');
 let saved=false;
 try {
 const result = await TlhInventory.request('COMMAND', pending);
 const data = result.ok ? {result: result.value} : {code: result.code};
 const res = {ok: result.ok, status: ['UNAVAILABLE','SAVE_UNKNOWN','BUSY','AUTH_UNAVAILABLE'].includes(data.code) ? 503 : 403};
 if(!res.ok){
  if(res.status>=500)throw Error('UNKNOWN');
  if(data.code==='CSRF_REJECTED'){message('サーバーが再起動しています。操作IDを保ったまま最新状態を取得して再確認してください。');await load();$('recovery').hidden=false;return;}
  pending=null;await load();message(errors[data.code]||'保存できませんでした：'+data.code);return;
 }
 saved=true;pending=null;await load();$('lines').replaceChildren();addLine();tab('stock');message('保存しました。DBの最新記録を読み直しました。');
 }catch{
  if(saved){message('保存は成功しましたが表示の更新に失敗しました。「最新の記録を読む」を押してください。');}
  else{message('保存結果が不明です。同じ操作を再確認してください。');$('recovery').hidden=false;}
 }finally{lock(false);}
}
$('receipt').onsubmit=e=>{e.preventDefault();const lines=[...$('lines').children].map(r=>r.requestLine());send({type:'RECEIVE',receivedOn:$('day').value,lines,completeCaseId:$('complete').value||null});};
$('retry').onclick=()=>send();
const readErrors={OWNER_AUTHORIZATION_REQUIRED:'サービス所有者のGoogle連携認可が必要です。',AUTH_REQUIRED:'LINEでログインしてください。',AUTH_UNAVAILABLE:'TLHアカウントの照合に接続できません。',LOGIN_UNAVAILABLE:'LINEログインの準備に失敗しました。',OFFLINE:'オンライン接続が必要です。',NOT_CONFIGURED:'在庫サービスの接続設定が未完了です。管理者に連絡してください。',FORBIDDEN:'TLHアカウントと有効な従業員登録を確認してください。',SCHEMA_MISMATCH:'在庫データを読み取れません。管理者に連絡してください。',LEDGER_REVIEW_REQUIRED:'保存原簿の整合性を確認する必要があります。',RPC_TIMEOUT:'Googleから応答がありません。もう一度読み込んでください。',RPC_FAILED:'Googleへの接続に失敗しました。もう一度読み込んでください。'};
const readFailure=e=>message('在庫を読み込めません。'+(readErrors[e?.message]||'Googleの認可・試験用Sheetへのアクセスを確認し、もう一度読み込んでください。'));
/** 初回失敗からの復旧時も入力行を用意する。読取の度に入力中の行を増やさない。 */
async function refresh(){
 if(busy)return;lock(true);message('在庫を読み込んでいます…');
 try{await load();if(!$('lines').children.length)addLine();message('最新の記録を読みました。');}
 catch(e){view=null;readFailure(e);}
 finally{lock(false);}
}
$('refresh').onclick=refresh;
$('add').onclick=()=>{if(view)addLine();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));if(view)render();};
const now=new Date();$('day').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
refresh();



window.addEventListener('pagehide', () => {view = null; pending = null; itemsById.clear();});
