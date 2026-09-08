const KEY='khonji_pwa_v1';
const BUILD='1.1.2';
const DEFAULT={
  trades:[],
  currencies:[],
  fx:{usdAed:3.67,eurUsd:1.150,usdQar:3.67,usdTry:48,omrAed:9.5},
  theme:'dark'
};
let state=load();
let currentView='dashboard';
let entryType='GOLD', entryBuy=true, selectedCoin='تمام سکه', editId=null, ledgerFilter='ALL';

function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||'null');
    return {...structuredClone(DEFAULT),...(x||{}),fx:{...DEFAULT.fx,...((x||{}).fx||{})}};
  }catch{return structuredClone(DEFAULT)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function fmt(x,d=3){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(Math.abs(x))}
function signed(x){return (x>0?'+':x<0?'−':'')+fmt(x)}
function coinActionMini(v,name){
  if(Math.abs(v)<1e-9)return 'بالانس';
  return `${fmt(v)} ${name} • ${v>0?'بفروش':'بخر'}`;
}
function formatMoneyInput(el){
  const raw=el.value.replace(/[^0-9]/g,'');
  if(!raw){el.value='';return}
  el.value=Number(raw).toLocaleString('en-US');
}
function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}
function isToday(t){return t.ts>=todayStart()}
function sign(t){return t.side==='BUY'?1:-1}
function eq18(t){
  if(t.asset==='تمام سکه')return t.qty*9.756;
  if(t.asset==='نیم سکه')return t.qty*4.878;
  if(t.asset==='ربع سکه')return t.qty*2.439;
  if(t.asset==='آبشده'||t.asset==='طلای متفرقه')return t.qty;
  return 0;
}
function calcGoldBalance(){return state.trades.reduce((a,t)=>a+sign(t)*eq18(t),0)}
function rawGold(){return state.trades.reduce((a,t)=>a+(t.asset==='آبشده'||t.asset==='طلای متفرقه'?sign(t)*t.qty:0),0)}
function coinBal(name){return state.trades.reduce((a,t)=>a+(t.asset===name?sign(t)*t.qty:0),0)}
function curBal(name){return state.trades.reduce((a,t)=>a+(t.asset===name?sign(t)*t.qty:0),0)}

function coinEq18(name,qty){
  if(name==='تمام سکه')return qty*9.756;
  if(name==='نیم سکه')return qty*4.878;
  if(name==='ربع سکه')return qty*2.439;
  return 0;
}
function coinQtyFor18(name,grams){
  const u = name==='تمام سکه'?9.756:name==='نیم سکه'?4.878:name==='ربع سکه'?2.439:0;
  return u>0 ? grams/u : 0;
}
function settlementTrades(){
  return state.trades.filter(t=>t.kind==='SETTLEMENT');
}
function normalTrades(){
  return state.trades.filter(t=>t.kind!=='SETTLEMENT');
}

function usdRate(n){
  if(n==='دلار')return 1;
  if(n==='درهم')return 1/state.fx.usdAed;
  if(n==='یورو')return state.fx.eurUsd;
  if(n==='ریال قطر')return 1/state.fx.usdQar;
  if(n==='لیر'||n==='لیر ترکیه')return 1/state.fx.usdTry;
  if(n==='ریال عمان')return state.fx.omrAed/state.fx.usdAed;
  return NaN;
}
function usdBalance(){
  return state.trades.reduce((a,t)=>{
    const r=usdRate(t.asset);
    return a+(Number.isNaN(r)?0:sign(t)*t.qty*r);
  },0)
}
function action(balance,unit,name=''){
  if(Math.abs(balance)<1e-9)return 'بالانس';
  return `${fmt(balance)} ${unit}${name?' '+name:''} ${balance>0?'بفروش':'بخر'}`;
}
function settlementConfirm(message){
  return confirm(message + '\n\nاین ثبت به عنوان «تسویه داخلی» ذخیره می‌شود.');
}

function addMultiSettlement({coins, goldGrams, direction}){
  const groupId='SET-'+Date.now();
  const ts=Date.now();

  if(direction==='GOLD_TO_COIN'){
    state.trades.unshift({
      id:ts+1, groupId, kind:'SETTLEMENT', leg:'GOLD',
      side:'SELL', asset:'آبشده', qty:goldGrams,
      total:0, rate:0, party:'تسویه داخلی',
      note:`پوشش ترکیبی سکه با ${fmt(goldGrams)} گرم طلا`,
      coinType:'BANK', autoQty:false, ts
    });

    coins.forEach((c,i)=>{
      state.trades.unshift({
        id:ts+10+i, groupId, kind:'SETTLEMENT', leg:'COIN',
        side:'BUY', asset:c.name, qty:c.qty,
        total:0, rate:0, party:'تسویه داخلی',
        note:`معادل ${fmt(coinEq18(c.name,c.qty))} گرم طلا`,
        coinType:'BANK', autoQty:false, ts
      });
    });
  }else{
    coins.forEach((c,i)=>{
      state.trades.unshift({
        id:ts+10+i, groupId, kind:'SETTLEMENT', leg:'COIN',
        side:'SELL', asset:c.name, qty:c.qty,
        total:0, rate:0, party:'تسویه داخلی',
        note:`پوشش طلای وزنی با ${fmt(c.qty)} ${c.name}`,
        coinType:'BANK', autoQty:false, ts
      });
    });

    state.trades.unshift({
      id:ts+1, groupId, kind:'SETTLEMENT', leg:'GOLD',
      side:'BUY', asset:'آبشده', qty:goldGrams,
      total:0, rate:0, party:'تسویه داخلی',
      note:`معادل ترکیبی سکه‌ها`,
      coinType:'BANK', autoQty:false, ts
    });
  }
  save();
}

function settlementCoinLabel(coins){
  return coins.map(c=>`${fmt(c.qty,0)} ${c.name.replace(' سکه','')}`).join(' + ');
}

function closeSettlementPicker(){
  document.getElementById('settlementPickerOverlay')?.remove();
}

function openSettlementPicker(direction, presetName=''){
  const rg=rawGold();
  const coinDefs=[
    {name:'تمام سکه', bal:coinBal('تمام سکه')},
    {name:'نیم سکه', bal:coinBal('نیم سکه')},
    {name:'ربع سکه', bal:coinBal('ربع سکه')}
  ];

  const eligible = coinDefs
    .filter(c=>direction==='COIN_TO_GOLD' ? c.bal>0.000001 : c.bal<-0.000001)
    .map(c=>({
      ...c,
      max:Math.max(0, Math.floor((direction==='COIN_TO_GOLD'?c.bal:Math.abs(c.bal))+1e-9)),
      qty:0
    }))
    .filter(c=>c.max>0);

  if(!eligible.length){
    alert('سکه قابل استفاده برای پوشش وجود ندارد.');
    return;
  }

  // Preselect one unit of the tapped coin (or first available) for speed.
  const preset = eligible.find(c=>c.name===presetName) || eligible[0];
  if(preset) preset.qty=Math.min(1,preset.max);

  const overlay=document.createElement('div');
  overlay.id='settlementPickerOverlay';
  overlay.className='settlementOverlay';
  overlay.innerHTML=`
    <div class="settlementModal" role="dialog" aria-modal="true">
      <div class="settlementModalHead">
        <div>
          <h3>${direction==='COIN_TO_GOLD'?'پوشش طلا از سکه‌ها':'پوشش سکه از طلا'}</h3>
          <small>${direction==='COIN_TO_GOLD'
            ? `طلای وزنی فعلی: ${signed(rg)} گرم`
            : `طلای وزنی در دسترس: ${signed(rg)} گرم`}</small>
        </div>
        <button class="modalClose" aria-label="بستن">×</button>
      </div>

      <div class="settlementPickerRows"></div>

      <div class="settlementCalc">
        <div><span>معادل انتخاب</span><strong id="pickerGoldEq">۰ گرم</strong></div>
        <div><span>بالانس طلای بعد از پوشش</span><strong id="pickerAfterGold">—</strong></div>
        <p id="pickerWarning"></p>
      </div>

      <div class="settlementModalActions">
        <button class="cancelSettle">انصراف</button>
        <button class="confirmSettle">تأیید و ثبت</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const rows=overlay.querySelector('.settlementPickerRows');

  function renderRows(){
    rows.innerHTML=eligible.map((c,i)=>`
      <div class="pickerCoinRow" data-i="${i}">
        <div class="pickerCoinName">
          <b>${c.name}</b>
          <small>قابل استفاده: ${fmt(c.max,0)} عدد</small>
        </div>
        <div class="pickerStepper">
          <button data-op="minus">−</button>
          <strong>${fmt(c.qty,0)}</strong>
          <button data-op="plus">+</button>
        </div>
      </div>`).join('');

    rows.querySelectorAll('.pickerCoinRow').forEach(row=>{
      const i=Number(row.dataset.i);
      row.querySelector('[data-op="minus"]').onclick=()=>{
        eligible[i].qty=Math.max(0,eligible[i].qty-1);
        renderRows(); updateCalc();
      };
      row.querySelector('[data-op="plus"]').onclick=()=>{
        eligible[i].qty=Math.min(eligible[i].max,eligible[i].qty+1);
        renderRows(); updateCalc();
      };
    });
  }

  function selectedCoins(){
    return eligible.filter(c=>c.qty>0).map(c=>({name:c.name,qty:c.qty}));
  }

  function updateCalc(){
    const selected=selectedCoins();
    const goldEq=selected.reduce((a,c)=>a+coinEq18(c.name,c.qty),0);
    const after = direction==='COIN_TO_GOLD' ? rg+goldEq : rg-goldEq;
    overlay.querySelector('#pickerGoldEq').textContent=`${fmt(goldEq)} گرم`;
    overlay.querySelector('#pickerAfterGold').textContent=`${signed(after)} گرم`;

    const warning=overlay.querySelector('#pickerWarning');
    const confirmBtn=overlay.querySelector('.confirmSettle');

    let invalid = selected.length===0;

    if(direction==='GOLD_TO_COIN' && goldEq>rg+0.000001){
      warning.textContent=`طلای کافی نیست؛ ${fmt(goldEq-rg)} گرم کمبود داری.`;
      warning.className='pickerWarning bad';
      invalid=true;
    }else if(direction==='COIN_TO_GOLD' && after>0.000001){
      warning.textContent=`با این انتخاب ${fmt(after)} گرم طلا مثبت می‌شوی.`;
      warning.className='pickerWarning';
    }else{
      warning.textContent='';
      warning.className='pickerWarning';
    }

    confirmBtn.disabled=invalid;
  }

  renderRows();
  updateCalc();

  overlay.querySelector('.modalClose').onclick=closeSettlementPicker;
  overlay.querySelector('.cancelSettle').onclick=closeSettlementPicker;
  overlay.onclick=e=>{ if(e.target===overlay) closeSettlementPicker(); };

  overlay.querySelector('.confirmSettle').onclick=()=>{
    const coins=selectedCoins();
    if(!coins.length)return;
    const goldEq=coins.reduce((a,c)=>a+coinEq18(c.name,c.qty),0);
    const list=settlementCoinLabel(coins);

    const msg=direction==='COIN_TO_GOLD'
      ? `${list} با معادل ${fmt(goldEq)} گرم طلا تسویه شود؟`
      : `${list} با ${fmt(goldEq)} گرم از طلای وزنی پوشش داده شود؟`;

    if(settlementConfirm(msg)){
      addMultiSettlement({coins,goldGrams:goldEq,direction});
      closeSettlementPicker();
      renderDashboard();
    }
  };
}

function settlementSummaryGroups(){
  const groups={};
  settlementTrades().forEach(t=>{
    if(!groups[t.groupId]) groups[t.groupId]={groupId:t.groupId,ts:t.ts,legs:[]};
    groups[t.groupId].legs.push(t);
  });
  return Object.values(groups).sort((a,b)=>b.ts-a.ts);
}

function setTheme(){
  document.body.classList.toggle('dark',state.theme==='dark');
  document.querySelector('meta[name="theme-color"]').setAttribute('content',state.theme==='dark'?'#0f1115':'#f7f5ef');
}
function show(view){
  currentView=view; editId=null;
  document.querySelector('.stickySave')?.remove();
  if(view==='dashboard')renderDashboard();
  if(view==='entry')renderEntry();
  if(view==='ledger')renderLedger();
  if(view==='report')renderReport();
  if(view==='settings')renderSettings();
}
function cloneTpl(id){return document.getElementById(id).content.cloneNode(true)}
function setView(node){const v=document.getElementById('view');v.innerHTML='';v.append(node);window.scrollTo({top:0,behavior:'instant'})}

function renderDashboard(){
  setView(cloneTpl('dashboardTpl'));
  const today=state.trades.filter(isToday);
  const buy=today.filter(t=>t.side==='BUY').reduce((a,t)=>a+eq18(t),0);
  const sell=today.filter(t=>t.side==='SELL').reduce((a,t)=>a+eq18(t),0);
  const bal=calcGoldBalance();
  document.getElementById('buyToday').textContent=fmt(buy); document.getElementById('sellToday').textContent=fmt(sell); document.getElementById('goldBalance').textContent=signed(bal);
  document.getElementById('mainAdvice').textContent=bal>0?`برای بالانس ${fmt(bal)} گرم بفروش`:bal<0?`برای بالانس ${fmt(bal)} گرم بخر`:'بالانس طلا صفر است';
  const unnamed=today.filter(t=>!t.party).length;
  document.getElementById('todaySummary').innerHTML=`تعداد معاملات امروز: <b>${fmt(today.length,0)}</b><br>ثبت‌های بدون طرف حساب: <b>${fmt(unnamed,0)}</b><br>طلای وزنی: <b>${signed(rawGold())} گرم</b>`;

  const rg=rawGold(),fc=coinBal('تمام سکه'),hc=coinBal('نیم سکه'),qc=coinBal('ربع سکه'),fxb=usdBalance();
  document.getElementById('sideRawGold').textContent = Math.abs(rg)<1e-9 ? 'بالانس' : `${fmt(rg)} گرم • ${rg>0?'بفروش':'بخر'}`;
  document.getElementById('sideFullCoin').textContent = coinActionMini(fc,'تمام');
  document.getElementById('sideHalfCoin').textContent = coinActionMini(hc,'نیم');
  document.getElementById('sideQuarterCoin').textContent = coinActionMini(qc,'ربع');
  document.getElementById('sideFx').textContent = Math.abs(fxb)<1e-9 ? 'بالانس' : `${fmt(fxb)} دلار ${fxb>0?'بفروش':'بخر'}`;

  function clearSettlementActions(){
    ['actRawGold','actFullCoin','actHalfCoin','actQuarterCoin'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.innerHTML='';
    });
  }
  clearSettlementActions();

  const coinStates=[
    {name:'تمام سکه', bal:fc, actionId:'actFullCoin'},
    {name:'نیم سکه', bal:hc, actionId:'actHalfCoin'},
    {name:'ربع سکه', bal:qc, actionId:'actQuarterCoin'}
  ];

  // Positive gold + negative coin balances:
  // every negative coin gets its own quick entry, but tapping opens
  // the combined picker so the user can select full/half/quarter together.
  if(rg>0){
    const deficits=coinStates.filter(c=>c.bal<0);
    deficits.forEach(c=>{
      const wrap=document.getElementById(c.actionId);
      if(!wrap)return;
      const need=Math.abs(c.bal);
      wrap.innerHTML=`<button class="settleBtn">پوشش بده • ${fmt(need,0)} ${c.name.replace(' سکه','')}</button>`;
      wrap.querySelector('button').onclick=()=>openSettlementPicker('GOLD_TO_COIN',c.name);
    });
  }

  // Negative gold + positive coin balances:
  // show ALL available coin types in one concise button, then allow
  // selecting the quantity of each type in the picker.
  if(rg<0){
    const positives=coinStates.filter(c=>c.bal>0.000001);
    if(positives.length){
      const summary=positives
        .map(c=>`${fmt(Math.floor(c.bal+1e-9),0)} ${c.name.replace(' سکه','')}`)
        .join(' • ');
      const wrap=document.getElementById('actRawGold');
      wrap.innerHTML=`
        <div class="coverageHint">قابل استفاده: ${summary}</div>
        <button class="settleBtn">از سکه‌ها پوشش بده</button>`;
      wrap.querySelector('button').onclick=()=>openSettlementPicker('COIN_TO_GOLD');
    }
  }

  const recent=[...today].sort((a,b)=>b.ts-a.ts).slice(0,4);
  document.getElementById('recentMini').innerHTML = recent.length ? recent.map(t=>`
    <div class="recentMiniItem">
      <div><b>${t.side==='BUY'?'خرید':'فروش'} ${t.asset}</b><br><small>${t.party||'بدون طرف حساب'}</small></div>
      <strong>${fmt(t.qty)}</strong>
    </div>`).join('') : '<span style="color:var(--muted)">امروز معامله‌ای ثبت نشده</span>';

  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{entryType=b.dataset.quick;show('entry')});
  document.querySelector('[data-action="open-buy"]').onclick=()=>{ledgerFilter='BUY';show('ledger')};
  document.querySelector('[data-action="open-sell"]').onclick=()=>{ledgerFilter='SELL';show('ledger')};
  document.querySelector('[data-action="open-balance"]').onclick=()=>show('report');
}

function renderEntry(){
  setView(cloneTpl('entryTpl'));
  let type=entryType;
  const assets= type==='GOLD'?['آبشده','طلای متفرقه']:
                type==='USD'?['دلار']:
                type==='AED'?['درهم']:
                type==='EUR'?['یورو']:
                type==='CUSTOM'?[...state.currencies]:[];
  let selectedAsset=assets[0]||'دلار';

  entryTitle.textContent= type==='GOLD'?'طلای آبشده و متفرقه':type==='COIN'?'سکه': type==='CUSTOM'?'ارز سفارشی':selectedAsset;
  entrySub.textContent=type==='COIN'?'تمام / نیم / ربع — پیش‌فرض بانکی':'ثبت سریع خرید و فروش';

  if(type==='COIN'){
    coinChooser.classList.remove('hidden');normalCoinWrap.classList.remove('hidden');
    qtyLabel.textContent='تعداد سکه';
  }else if(type==='GOLD') qtyLabel.textContent='وزن (گرم)';
  else qtyLabel.textContent='مقدار ارز';

  if(assets.length>1||type==='CUSTOM'){
    assetChooser.classList.remove('hidden');
    assetChooser.innerHTML='<div class="segRow">'+assets.map((a,i)=>`<button data-asset="${a}" class="${i===0?'active':''}">${a}</button>`).join('')+'</div>';
    assetChooser.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      selectedAsset=b.dataset.asset;
      assetChooser.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    });
  }
  if(type==='CUSTOM'&&!assets.length){
    assetChooser.classList.remove('hidden');
    assetChooser.innerHTML='<p>هنوز ارز سفارشی تعریف نشده. از بخش «بیشتر» یک ارز اضافه کن.</p>';
  }

  function refreshMode(){
    buyBtn.classList.toggle('active',entryBuy);sellBtn.classList.toggle('active',!entryBuy);
    saveTrade.textContent=editId?'ذخیره تغییرات':(entryBuy?'ثبت خرید':'ثبت فروش');
    saveTrade.style.background=entryBuy?'var(--green)':'var(--red)';
  }
  refreshMode();
  buyBtn.onclick=()=>{entryBuy=true;refreshMode()};sellBtn.onclick=()=>{entryBuy=false;refreshMode()};

  document.querySelectorAll('[data-coin]').forEach(b=>b.onclick=()=>{
    selectedCoin=b.dataset.coin;document.querySelectorAll('[data-coin]').forEach(x=>x.classList.toggle('active',x===b));
  });

  const step=type==='COIN'?1:type==='GOLD'?1:100;
  minusBtn.onclick=()=>{qty.value=Math.max(0,(parseFloat(qty.value)||0)-step);qty.dispatchEvent(new Event('input'))};
  plusBtn.onclick=()=>{qty.value=(parseFloat(qty.value)||0)+step;qty.dispatchEvent(new Event('input'))};

  const chipVals=type==='COIN'?[1,2,5]:type==='GOLD'?[100,250,500]:[1000,5000,10000];
  chips.innerHTML=chipVals.map(x=>`<button data-chip="${x}">${new Intl.NumberFormat('fa-IR').format(x)}${type==='COIN'?' عدد':type==='GOLD'?' گرم':''}</button>`).join('');
  chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{qty.value=b.dataset.chip;qty.dispatchEvent(new Event('input'))});

  [total,unitRate].forEach(el=>el.addEventListener('input',()=>{
    if(type!=='GOLD'||qty.value.trim()){autoWeight.classList.add('hidden');return}
    const t=Number(total.value.replaceAll(',','')),r=Number(unitRate.value.replaceAll(',',''));
    if(t>0&&r>0){autoWeight.textContent=`وزن محاسبه‌شده: ${fmt(t/r)} گرم`;autoWeight.classList.remove('hidden')}else autoWeight.classList.add('hidden')
  }));

  [qty,total,unitRate,party,note].forEach(el=>{
    const reveal=()=>{
      const run=()=>{
        if(document.activeElement!==el)return;
        const saveRect=saveTrade.getBoundingClientRect();
        const r=el.closest('.panel')?.getBoundingClientRect()||el.getBoundingClientRect();
        const safeBottom=Math.min(window.innerHeight,saveRect.top)-18;
        const safeTop=88;
        if(r.bottom>safeBottom) window.scrollBy({top:r.bottom-safeBottom+18,behavior:'smooth'});
        else if(r.top<safeTop) window.scrollBy({top:r.top-safeTop-16,behavior:'smooth'});
      };
      setTimeout(run,80);setTimeout(run,240);setTimeout(run,480);
    };
    el.addEventListener('focus',reveal);
    el.addEventListener('click',reveal);
  });

  [total,unitRate].forEach(el=>{
    el.addEventListener('blur',()=>formatMoneyInput(el));
  });

  if(editId){
    const t=state.trades.find(x=>x.id===editId);
    if(t){
      entryBuy=t.side==='BUY'; selectedCoin=t.asset; selectedAsset=t.asset;
      qty.value=t.qty; total.value=t.total||''; unitRate.value=t.rate||'';party.value=t.party||'';note.value=t.note||'';
      normalCoin.checked=t.coinType==='NORMAL';refreshMode();
    }
  }

  saveTrade.onclick=()=>{
    const asset=type==='COIN'?selectedCoin:selectedAsset;
    let q=Number(qty.value||0),auto=false;
    if(!q&&type==='GOLD'){
      const t=Number(total.value.replaceAll(',','')||0),r=Number(unitRate.value.replaceAll(',','')||0);
      if(t>0&&r>0){q=t/r;auto=true}
    }
    if(!(q>0)){alert('وزن / تعداد / مقدار را وارد کن');return}
    const trade={
      id:editId||Date.now(),
      side:entryBuy?'BUY':'SELL',
      asset,qty:q,total:Number(total.value.replaceAll(',','')||0),rate:Number(unitRate.value.replaceAll(',','')||0),
      party:party.value.trim(),note:note.value.trim(),coinType:normalCoin.checked?'NORMAL':'BANK',autoQty:auto,ts:editId?(state.trades.find(x=>x.id===editId)?.ts||Date.now()):Date.now()
    };
    if(editId) state.trades=state.trades.map(x=>x.id===editId?trade:x); else state.trades.unshift(trade);
    save();show('dashboard');
  }
}

function renderLedger(){
  setView(cloneTpl('ledgerTpl'));
  document.querySelectorAll('[data-filter]').forEach(b=>{
    b.classList.toggle('active',b.dataset.filter===ledgerFilter);
    b.onclick=()=>{ledgerFilter=b.dataset.filter;renderLedger()}
  });
  let data=state.trades.filter(isToday);
  if(ledgerFilter==='BUY')data=data.filter(t=>t.side==='BUY');
  if(ledgerFilter==='SELL')data=data.filter(t=>t.side==='SELL');
  if(ledgerFilter==='UNNAMED')data=data.filter(t=>!t.party);
  ledgerList.innerHTML=data.length?'':'<div class="panel">ثبت امروز پیدا نشد.</div>';
  data.forEach(t=>{
    const el=document.createElement('article');el.className='tradeCard';
    const settlementBadge=t.kind==='SETTLEMENT' ? '<span class="settlementBadge">تسویه داخلی</span>' : '';
    el.innerHTML=`<div class="top"><b>${t.asset} • ${fmt(t.qty)} ${settlementBadge}</b><span class="pill ${t.side==='BUY'?'buy':'sell'}">${t.side==='BUY'?'خرید':'فروش'}</span></div>
      <div class="meta">${t.party?`طرف حساب: ${t.party}`:'بدون طرف حساب'}${t.total?`<br>مبلغ: ${new Intl.NumberFormat('fa-IR').format(t.total)} تومان`:''}${t.rate?`<br>نرخ: ${new Intl.NumberFormat('fa-IR').format(t.rate)}`:''}${t.note?`<br>${t.note}`:''}</div>
      <div class="actions"><button data-edit>ویرایش</button><button data-del>حذف</button></div>`;
    el.querySelector('[data-edit]').onclick=()=>{editId=t.id;entryType=t.asset.includes('سکه')?'COIN':(t.asset==='آبشده'||t.asset==='طلای متفرقه')?'GOLD':t.asset==='دلار'?'USD':t.asset==='درهم'?'AED':t.asset==='یورو'?'EUR':'CUSTOM';show('entry')};
    el.querySelector('[data-del]').onclick=()=>{if(confirm('این ثبت حذف شود؟')){state.trades=state.trades.filter(x=>x.id!==t.id);save();renderLedger()}};
    ledgerList.append(el);
  });
}

function renderReport(){
  setView(cloneTpl('reportTpl'));
  const cards=[];
  const g=calcGoldBalance(),raw=rawGold(),usd=usdBalance();
  cards.push(['بالانس کل ۱۸ عیار',`${signed(g)} گرم`,action(g,'گرم')]);
  cards.push(['طلای وزنی',`${signed(raw)} گرم`,action(raw,'گرم')]);
  ['تمام سکه','نیم سکه','ربع سکه'].forEach(c=>{const b=coinBal(c);if(Math.abs(b)>1e-9)cards.push([c,`${signed(b)} عدد`,action(b,'عدد',c)])});
  const curs=[...new Set(['دلار','درهم','یورو','ریال قطر','لیر','ریال عمان',...state.currencies])];
  curs.forEach(c=>{const b=curBal(c);if(Math.abs(b)>1e-9)cards.push([c,signed(b),action(b,c)])});
  cards.push(['بالانس کلی ارز — معادل دلار',`${signed(usd)} دلار`,action(usd,'دلار')]);
  document.getElementById('reportCards').innerHTML=cards.map(([t,v,a])=>`<article class="reportCard"><h3>${t}</h3><strong>${v}</strong><div class="action">${a}</div></article>`).join('');

  const groups=settlementSummaryGroups();
  document.getElementById('settlementHistory').innerHTML = groups.length ? groups.map(g=>{
    const coinLegs=g.legs.filter(x=>x.leg==='COIN');
    const goldLeg=g.legs.find(x=>x.leg==='GOLD');
    if(!coinLegs.length||!goldLeg) return '';
    const dir = coinLegs[0].side==='BUY' ? 'طلا → سکه' : 'سکه → طلا';
    const coinsText=coinLegs.map(x=>`${fmt(x.qty,0)} ${x.asset.replace(' سکه','')}`).join(' + ');
    return `<article class="reportCard settlementCard">
      <h3>${dir}</h3>
      <strong>${coinsText}</strong>
      <div class="action">معادل ${fmt(goldLeg.qty)} گرم طلا</div>
      <small>${new Date(g.ts).toLocaleString('fa-IR')}</small>
    </article>`;
  }).join('') : '<div class="panel mutedBox">هنوز تسویه داخلی ثبت نشده</div>';
}

function renderSettings(){
  setView(cloneTpl('settingsTpl'));
  usdAed.value=state.fx.usdAed;eurUsd.value=state.fx.eurUsd;usdQar.value=state.fx.usdQar;usdTry.value=state.fx.usdTry;omrAed.value=state.fx.omrAed;
  saveFx.onclick=()=>{state.fx={usdAed:+usdAed.value||3.67,eurUsd:+eurUsd.value||1.15,usdQar:+usdQar.value||3.67,usdTry:+usdTry.value||48,omrAed:+omrAed.value||9.5};save();alert('ضرایب ذخیره شد')};
  function tags(){currencyList.innerHTML=state.currencies.map(c=>`<span class="tag">${c}</span>`).join('')}
  tags();
  addCurrencyBtn.onclick=()=>{const n=customCurrencyName.value.trim();if(n&&!state.currencies.includes(n)){state.currencies.push(n);save();customCurrencyName.value='';tags()}};
  exportBtn.onclick=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`khonji-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)
  };
  importFile.onchange=async()=>{
    const f=importFile.files[0];if(!f)return;
    try{const x=JSON.parse(await f.text());if(!x.trades)throw 0;if(confirm('اطلاعات فعلی با بکاپ جایگزین شود؟')){state=x;save();location.reload()}}catch{alert('فایل بکاپ معتبر نیست')}
  }
}

document.querySelectorAll('.bottomNav button').forEach(b=>b.onclick=()=>show(b.dataset.view));
themeBtn.onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';save();setTheme()};
setTheme();show('dashboard');

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
