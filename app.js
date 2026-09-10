const KEY='khonji_pwa_v1';
const BUILD_VERSION='1.5.8';
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
function liveStatusHtml(value, text){
  if(Math.abs(value)<1e-9){
    return `<span class="liveState balanced">${text}</span>`;
  }
  const cls=value>0?'sellState':'buyState';
  return `<span class="liveState ${cls}"><i class="statusDot"></i>${text}</span>`;
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

const COVER_ASSETS=[
  {name:'آبشده', label:'طلای وزنی', unit:'گرم', eq:1, step:0.001, integer:false},
  {name:'تمام سکه', label:'تمام', unit:'عدد', eq:9.756, step:1, integer:true},
  {name:'نیم سکه', label:'نیم', unit:'عدد', eq:4.878, step:1, integer:true},
  {name:'ربع سکه', label:'ربع', unit:'عدد', eq:2.439, step:1, integer:true}
];

function assetDef(name){ return COVER_ASSETS.find(x=>x.name===name); }
function coverBalance(name){ return name==='آبشده' ? rawGold() : coinBal(name); }
function assetEq18(name,qty){ const d=assetDef(name); return d ? d.eq*qty : 0; }
function coverFmtQty(name,qty){ const d=assetDef(name); return fmt(qty,d?.integer?0:3); }
function coverLabel(name,qty){
  const d=assetDef(name);
  return `${coverFmtQty(name,qty)} ${d?.label||name}`;
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

function addSmartSettlement({targetName,targetQty,sources}){
  const groupId='SET-'+Date.now();
  const ts=Date.now();

  sources.forEach((s,i)=>{
    state.trades.unshift({
      id:ts+10+i, groupId, kind:'SETTLEMENT', leg:'SOURCE',
      side:'SELL', asset:s.name, qty:s.qty,
      total:0, rate:0, party:'تسویه داخلی',
      note:`پوشش ${coverLabel(targetName,targetQty)}`,
      coinType:'BANK', autoQty:false, ts
    });
  });

  state.trades.unshift({
    id:ts+1, groupId, kind:'SETTLEMENT', leg:'TARGET',
    side:'BUY', asset:targetName, qty:targetQty,
    total:0, rate:0, party:'تسویه داخلی',
    note:`پوشش با ${sources.map(s=>coverLabel(s.name,s.qty)).join(' + ')}`,
    coinType:'BANK', autoQty:false, ts
  });
  save();
}

function closeSettlementPicker(){
  document.getElementById('settlementPickerOverlay')?.remove();
}

function availablePositiveSources(excludeName){
  return COVER_ASSETS
    .filter(a=>a.name!==excludeName)
    .map(a=>({...a,bal:coverBalance(a.name)}))
    .filter(a=>a.bal>0.000001);
}

function solveSourcesExact(targetName,targetQty){
  const need=assetEq18(targetName,targetQty);
  if(need<=0)return null;

  const src=availablePositiveSources(targetName);
  if(!src.length)return null;

  const gold=src.find(s=>s.name==='آبشده');
  const full=Math.floor((src.find(s=>s.name==='تمام سکه')?.bal||0)+1e-9);
  const half=Math.floor((src.find(s=>s.name==='نیم سکه')?.bal||0)+1e-9);
  const quarter=Math.floor((src.find(s=>s.name==='ربع سکه')?.bal||0)+1e-9);

  // Search coin combinations bounded by target equivalent, not by total inventory.
  const mf=Math.min(full,Math.floor((need+0.0005)/9.756));
  const mh=Math.min(half,Math.floor((need+0.0005)/4.878));
  const mq=Math.min(quarter,Math.floor((need+0.0005)/2.439));

  let best=null;
  for(let f=0;f<=mf;f++){
    for(let h=0;h<=mh;h++){
      for(let q=0;q<=mq;q++){
        const coinEq=f*9.756+h*4.878+q*2.439;
        if(coinEq>need+0.0005)continue;
        const rem=need-coinEq;
        if(rem>0.0005 && (!gold || gold.bal+0.0005<rem))continue;

        const arr=[];
        if(f)arr.push({name:'تمام سکه',qty:f});
        if(h)arr.push({name:'نیم سکه',qty:h});
        if(q)arr.push({name:'ربع سکه',qty:q});
        if(rem>0.0005)arr.push({name:'آبشده',qty:rem});
        if(!arr.length)continue;

        // Prefer less gold, then fewer source units.
        const goldUsed=rem>0.0005?rem:0;
        const itemCount=f+h+q+(goldUsed>0?1:0);
        const score=goldUsed*1000+itemCount;
        if(!best || score<best.score)best={sources:arr,score};
      }
    }
  }
  return best?.sources||null;
}

function bestFeasibleTarget(targetName){
  const bal=coverBalance(targetName);
  if(bal>=-0.000001)return null;
  const deficit=Math.abs(bal);
  const def=assetDef(targetName);

  if(def?.integer){
    const max=Math.floor(deficit+1e-9);
    for(let q=max;q>=1;q--){
      const sources=solveSourcesExact(targetName,q);
      if(sources)return {targetQty:q,sources,full:q===max};
    }
    return null;
  }

  // Gold target: source assets are coins, so choose the largest exact coin-equivalent
  // that does not exceed the gold deficit.
  const src=availablePositiveSources(targetName);
  const full=Math.floor((src.find(s=>s.name==='تمام سکه')?.bal||0)+1e-9);
  const half=Math.floor((src.find(s=>s.name==='نیم سکه')?.bal||0)+1e-9);
  const quarter=Math.floor((src.find(s=>s.name==='ربع سکه')?.bal||0)+1e-9);

  let best=null;
  const mf=Math.min(full,Math.floor(deficit/9.756)+1);
  const mh=Math.min(half,Math.floor(deficit/4.878)+1);
  const mq=Math.min(quarter,Math.floor(deficit/2.439)+1);

  for(let f=0;f<=mf;f++){
    for(let h=0;h<=mh;h++){
      for(let q=0;q<=mq;q++){
        const eq=f*9.756+h*4.878+q*2.439;
        if(eq<=0.0005 || eq>deficit+0.0005)continue;
        if(!best || eq>best.eq+0.0005 || (Math.abs(eq-best.eq)<0.0005 && f+h+q<best.count)){
          const arr=[];
          if(f)arr.push({name:'تمام سکه',qty:f});
          if(h)arr.push({name:'نیم سکه',qty:h});
          if(q)arr.push({name:'ربع سکه',qty:q});
          best={targetQty:eq,sources:arr,eq,count:f+h+q};
        }
      }
    }
  }
  if(!best)return null;
  best.full=Math.abs(best.targetQty-deficit)<0.0005;
  return best;
}

function openSmartCoverPicker(targetName){
  const targetBal=coverBalance(targetName);
  if(targetBal>=-0.000001){
    alert('این مورد در حال حاضر کسری ندارد.');
    return;
  }

  const deficit=Math.abs(targetBal);
  const proposal=bestFeasibleTarget(targetName);
  if(!proposal){
    alert('با موجودی فعلی، حتی پوشش جزئی معتبر هم برای این مورد ممکن نیست.');
    return;
  }

  const tdef=assetDef(targetName);
  let selectedTarget=proposal.targetQty;

  const sourceDefs=availablePositiveSources(targetName).map(s=>({...s,qty:0}));
  proposal.sources.forEach(p=>{
    const x=sourceDefs.find(s=>s.name===p.name);
    if(x)x.qty=p.qty;
  });

  const overlay=document.createElement('div');
  overlay.id='settlementPickerOverlay';
  overlay.className='settlementOverlay';
  overlay.innerHTML=`
    <div class="settlementModal" role="dialog" aria-modal="true">
      <div class="settlementModalHead">
        <div>
          <h3>پوشش ${tdef?.label||targetName}</h3>
          <small>کسری کل: ${coverLabel(targetName,deficit)}</small>
        </div>
        <button class="modalClose" aria-label="بستن">×</button>
      </div>

      <div class="targetPickerBox">
        <span>مقدار موردنظر برای پوشش</span>
        <div class="targetStepper">
          <button data-target-op="minus">−</button>
          <input id="targetQtyInput" type="text" inputmode="none" pattern="[0-9۰-۹.,]*" dir="ltr" data-custom-keypad="1">
          <button data-target-op="plus">+</button>
        </div>
        <small id="targetEqText"></small>
      </div>

      <div class="smartProposal">
        پیشنهاد فعلی:
        <b id="proposalText"></b>
      </div>

      <div class="settlementPickerRows"></div>

      <div class="settlementCalc">
        <div><span>معادل هدف</span><strong id="targetEqVal">۰ گرم</strong></div>
        <div><span>معادل منابع</span><strong id="sourceEqVal">۰ گرم</strong></div>
        <div><span>اختلاف</span><strong id="pickerDiff">—</strong></div>
        <p id="pickerWarning"></p>
      </div>

      <div class="settlementModalActions">
        <button class="cancelSettle">انصراف</button>
        <button class="confirmSettle">تأیید و ثبت</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const rows=overlay.querySelector('.settlementPickerRows');
  const targetInput=overlay.querySelector('#targetQtyInput');

  function normalizeTarget(v){
    v=Math.max(0,Math.min(deficit,Number(v)||0));
    if(tdef?.integer)v=Math.round(v);
    return v;
  }

  function resetSourcesToProposal(){
    sourceDefs.forEach(s=>s.qty=0);
    const p=solveSourcesExact(targetName,selectedTarget);
    if(p){
      p.forEach(x=>{
        const s=sourceDefs.find(y=>y.name===x.name);
        if(s)s.qty=x.qty;
      });
    }
  }

  function selectedSources(){
    return sourceDefs.filter(s=>s.qty>0.000001).map(s=>({name:s.name,qty:s.qty}));
  }

  function renderRows(){
    rows.innerHTML=sourceDefs.map((s,i)=>{
      const isGold=s.name==='آبشده';
      return `
      <div class="pickerCoinRow" data-i="${i}">
        <div class="pickerCoinName">
          <b>${s.label}</b>
          <small>در دسترس: ${coverFmtQty(s.name,s.bal)} ${s.unit}</small>
        </div>
        <div class="pickerStepper">
          <button data-op="minus">−</button>
          <input class="pickerQtyInput" type="text" inputmode="none" pattern="[0-9۰-۹.,]*" dir="ltr" data-custom-keypad="1"
                 value="${s.qty ? Number(s.qty.toFixed(isGold?3:0)) : 0}">
          <button data-op="plus">+</button>
        </div>
      </div>`;
    }).join('');

    rows.querySelectorAll('.pickerCoinRow').forEach(row=>{
      const i=Number(row.dataset.i);
      const s=sourceDefs[i];
      const input=row.querySelector('.pickerQtyInput');

      row.querySelector('[data-op="minus"]').onclick=()=>{
        const step=s.name==='آبشده'?0.001:1;
        s.qty=Math.max(0,s.qty-step);
        if(s.integer)s.qty=Math.round(s.qty);
        renderRows(); updateCalc();
      };
      row.querySelector('[data-op="plus"]').onclick=()=>{
        const step=s.name==='آبشده'?0.001:1;
        s.qty=Math.min(s.bal,s.qty+step);
        if(s.integer)s.qty=Math.round(s.qty);
        renderRows(); updateCalc();
      };
      input.oninput=()=>{
        let v=Number(input.value.replace(',','.'))||0;
        if(s.integer)v=Math.round(v);
        s.qty=Math.max(0,Math.min(s.bal,v));
        updateCalc();
      };
      input.onblur=()=>renderRows();
    });
  }

  function updateTargetDisplay(){
    targetInput.value=selectedTarget ? Number(selectedTarget.toFixed(tdef?.integer?0:3)) : 0;
    const eq=assetEq18(targetName,selectedTarget);
    overlay.querySelector('#targetEqText').textContent=`معادل ${fmt(eq)} گرم ۱۸`;
  }

  function updateCalc(){
    const targetEq=assetEq18(targetName,selectedTarget);
    const selected=selectedSources();
    const sourceEq=selected.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    const diff=sourceEq-targetEq;

    overlay.querySelector('#targetEqVal').textContent=`${fmt(targetEq)} گرم`;
    overlay.querySelector('#sourceEqVal').textContent=`${fmt(sourceEq)} گرم`;
    overlay.querySelector('#pickerDiff').textContent=
      Math.abs(diff)<0.0005 ? 'دقیق' :
      diff>0 ? `${fmt(diff)} گرم اضافه` : `${fmt(Math.abs(diff))} گرم کم`;

    overlay.querySelector('#proposalText').textContent=
      selected.length ? selected.map(s=>coverLabel(s.name,s.qty)).join(' + ') : '—';

    const warning=overlay.querySelector('#pickerWarning');
    const confirmBtn=overlay.querySelector('.confirmSettle');

    if(selectedTarget>0 && selected.length && Math.abs(diff)<0.0005){
      warning.textContent=selectedTarget+0.0005>=deficit?'پوشش کامل است.':'پوشش جزئی معتبر است.';
      warning.className='pickerWarning ok';
      confirmBtn.disabled=false;
    }else{
      warning.textContent='معادل منابع باید دقیقاً با مقدار پوشش انتخاب‌شده برابر باشد.';
      warning.className='pickerWarning';
      confirmBtn.disabled=true;
    }
  }

  overlay.querySelector('[data-target-op="minus"]').onclick=()=>{
    const step=tdef?.integer?1:0.001;
    selectedTarget=normalizeTarget(selectedTarget-step);
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };
  overlay.querySelector('[data-target-op="plus"]').onclick=()=>{
    const step=tdef?.integer?1:0.001;
    selectedTarget=normalizeTarget(selectedTarget+step);
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };
  targetInput.onchange=()=>{
    selectedTarget=normalizeTarget(targetInput.value.replace(',','.'));
    resetSourcesToProposal(); updateTargetDisplay(); renderRows(); updateCalc();
  };

  updateTargetDisplay();
  renderRows();
  updateCalc();

  overlay.querySelector('.modalClose').onclick=closeSettlementPicker;
  overlay.querySelector('.cancelSettle').onclick=closeSettlementPicker;
  overlay.onclick=e=>{if(e.target===overlay)closeSettlementPicker()};

  overlay.querySelector('.confirmSettle').onclick=()=>{
    const sources=selectedSources();
    const targetEq=assetEq18(targetName,selectedTarget);
    const sourceEq=sources.reduce((a,s)=>a+assetEq18(s.name,s.qty),0);
    if(selectedTarget<=0 || Math.abs(sourceEq-targetEq)>=0.0005)return;

    const msg=`${coverLabel(targetName,selectedTarget)} با ${sources.map(s=>coverLabel(s.name,s.qty)).join(' + ')} پوشش داده شود؟`;
    if(settlementConfirm(msg)){
      addSmartSettlement({targetName,targetQty:selectedTarget,sources});
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
  document.getElementById('buyToday').textContent=fmt(buy);
  document.getElementById('sellToday').textContent=fmt(sell);
  const gb=document.getElementById('goldBalance');
  gb.textContent=signed(bal);
  gb.classList.remove('balancePositive','balanceNegative','balanceZero');
  gb.classList.add(Math.abs(bal)<1e-9?'balanceZero':bal>0?'balancePositive':'balanceNegative');
  document.getElementById('mainAdvice').textContent=bal>0?`برای بالانس ${fmt(bal)} گرم بفروش`:bal<0?`برای بالانس ${fmt(bal)} گرم بخر`:'بالانس طلا صفر است';
  const unnamed=today.filter(t=>!t.party).length;
  document.getElementById('todaySummary').innerHTML=`تعداد معاملات امروز: <b>${fmt(today.length,0)}</b><br>ثبت‌های بدون طرف حساب: <b>${fmt(unnamed,0)}</b><br>طلای وزنی: <b>${signed(rawGold())} گرم</b>`;

  const rg=rawGold(),fc=coinBal('تمام سکه'),hc=coinBal('نیم سکه'),qc=coinBal('ربع سکه'),fxb=usdBalance();
  document.getElementById('sideRawGold').innerHTML = liveStatusHtml(
    rg,
    Math.abs(rg)<1e-9 ? 'بالانس' : `${fmt(Math.abs(rg))} گرم • ${rg>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideFullCoin').innerHTML = liveStatusHtml(
    fc,
    Math.abs(fc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(fc),0)} تمام • ${fc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideHalfCoin').innerHTML = liveStatusHtml(
    hc,
    Math.abs(hc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(hc),0)} نیم • ${hc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideQuarterCoin').innerHTML = liveStatusHtml(
    qc,
    Math.abs(qc)<1e-9 ? 'بالانس' : `${fmt(Math.abs(qc),0)} ربع • ${qc>0?'بفروش':'بخر'}`
  );
  document.getElementById('sideFx').innerHTML = liveStatusHtml(
    fxb,
    Math.abs(fxb)<1e-9 ? 'بالانس' : `${fmt(Math.abs(fxb))} دلار • ${fxb>0?'بفروش':'بخر'}`
  );

  function clearSettlementActions(){
    ['actRawGold','actFullCoin','actHalfCoin','actQuarterCoin'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.innerHTML='';
    });
  }
  clearSettlementActions();

  const coverRows=[
    {name:'آبشده', actionId:'actRawGold'},
    {name:'تمام سکه', actionId:'actFullCoin'},
    {name:'نیم سکه', actionId:'actHalfCoin'},
    {name:'ربع سکه', actionId:'actQuarterCoin'}
  ];

  // Suggest when at least one non-zero valid cover (full OR partial) exists.
  coverRows.forEach(row=>{
    const bal=coverBalance(row.name);
    if(bal>=-0.000001)return;

    const p=bestFeasibleTarget(row.name);
    if(!p || p.targetQty<=0)return;

    const wrap=document.getElementById(row.actionId);
    if(!wrap)return;

    const kind=p.full?'پوشش کامل':'پوشش جزئی';
    const srcText=p.sources.map(s=>coverLabel(s.name,s.qty)).join(' + ');
    wrap.innerHTML=`
      <div class="coverageHint">${kind}: ${coverLabel(row.name,p.targetQty)} ← ${srcText}</div>
      <button class="settleBtn">پوشش بده</button>`;
    wrap.querySelector('button').onclick=()=>openSmartCoverPicker(row.name);
  });

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




let customKeypadTarget=null;

function closeCustomKeypad(){
  const kp=document.getElementById('customNumericKeypad');
  if(kp){
    kp.classList.remove('show');
    const label=kp.querySelector('#ckFieldLabel');
    if(label)label.textContent='';
  }
  customKeypadTarget=null;
  document.body.classList.remove('customKeypadOpen');
}

function ensureCustomKeypad(){
  let kp=document.getElementById('customNumericKeypad');
  if(kp)return kp;

  kp=document.createElement('div');
  kp.id='customNumericKeypad';
  kp.className='customNumericKeypad';
  kp.innerHTML=`
    <div class="ckTop">
      <div class="ckTitleWrap">
        <strong>ورود عدد</strong>
        <span id="ckFieldLabel"></span>
      </div>
      <button type="button" data-k="done" class="ckDone">تمام</button>
    </div>
    <div class="ckGrid">
      <button type="button" data-k="1">1</button>
      <button type="button" data-k="2">2</button>
      <button type="button" data-k="3">3</button>
      <button type="button" data-k="4">4</button>
      <button type="button" data-k="5">5</button>
      <button type="button" data-k="6">6</button>
      <button type="button" data-k="7">7</button>
      <button type="button" data-k="8">8</button>
      <button type="button" data-k="9">9</button>
      <button type="button" data-k=".">.</button>
      <button type="button" data-k="0">0</button>
      <button type="button" data-k="back" class="ckBack">⌫</button>
    </div>
  `;
  document.body.appendChild(kp);

  kp.addEventListener('pointerdown',e=>e.preventDefault());

  kp.addEventListener('click',e=>{
    const b=e.target.closest('button[data-k]');
    if(!b || !customKeypadTarget)return;
    const k=b.dataset.k;

    if(k==='done'){
      customKeypadTarget.dispatchEvent(new Event('change',{bubbles:true}));
      closeCustomKeypad();
      return;
    }

    let v=customKeypadTarget.value||'';

    if(k==='back'){
      v=v.slice(0,-1);
    }else if(k==='.'){
      if(!v.includes('.')) v = v ? v+'.' : '0.';
    }else{
      v+=k;
    }

    if(customKeypadTarget.id==='total' || customKeypadTarget.id==='unitRate'){
      customKeypadTarget.value=formatGroupedInputValue(v,false,0);
    }else if(customKeypadTarget.id==='qty'){
      customKeypadTarget.value=formatGroupedInputValue(v,true,3);
    }else{
      customKeypadTarget.value=v;
    }
    customKeypadTarget.dispatchEvent(new Event('input',{bubbles:true}));
  });

  return kp;
}

function openCustomKeypad(el){
  customKeypadTarget=el;
  const kp=ensureCustomKeypad();
  const label=kp.querySelector('#ckFieldLabel');
  if(label){
    const panel=el.closest('.panel');
    const txt=panel?.querySelector('label, .fieldLabel, .stepLabel')?.textContent?.trim()
      || el.getAttribute('aria-label')
      || '';
    label.textContent=txt;
  }
  kp.classList.add('show');
  document.body.classList.add('customKeypadOpen');

  try{el.focus({preventScroll:true})}catch(_){el.focus()}
  setTimeout(()=>{
    const r=el.closest('.panel')?.getBoundingClientRect() || el.getBoundingClientRect();
    const kpRect=kp.getBoundingClientRect();
    const safeBottom=kpRect.top-18;
    if(r.bottom>safeBottom){
      window.scrollBy({top:r.bottom-safeBottom+22,behavior:'smooth'});
    }else if(r.top<70){
      window.scrollBy({top:r.top-70,behavior:'smooth'});
    }
  },80);
}


function normalizeDigits(s){
  return String(s??'')
    .replace(/[۰-۹]/g,d=>'0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٬،,\s]/g,'')
    .replace(/٫/g,'.');
}

function parseLooseNumber(v){
  const n=Number(normalizeDigits(v));
  return Number.isFinite(n)?n:NaN;
}

function formatGroupedNumber(v, maxDecimals=3){
  if(v===null || v===undefined || v==='')return '';
  const n=typeof v==='number'?v:parseLooseNumber(v);
  if(!Number.isFinite(n))return '';
  const fixed=n.toFixed(maxDecimals).replace(/\.?0+$/,'');
  const [intPart,decPart]=fixed.split('.');
  const grouped=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return decPart!==undefined ? `${grouped}.${decPart}` : grouped;
}

function formatGroupedInputValue(raw, allowDecimal=true, maxDecimals=3){
  let s=normalizeDigits(raw);
  if(!allowDecimal)s=s.replace(/\./g,'');
  const parts=s.split('.');
  let intPart=(parts[0]||'').replace(/\D/g,'');
  let decPart=allowDecimal ? (parts.slice(1).join('').replace(/\D/g,'').slice(0,maxDecimals)) : '';
  intPart=intPart.replace(/^0+(?=\d)/,'');
  if(intPart)intPart=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  if(allowDecimal && s.includes('.'))return `${intPart||'0'}.${decPart}`;
  return intPart;
}

function installCustomNumericKeypad(scope=document){
  scope.querySelectorAll('input[data-custom-keypad="1"], .pickerQtyInput').forEach(el=>{
    if(el.dataset.ckReady==='1')return;
    el.dataset.ckReady='1';
    el.setAttribute('inputmode','none');
    el.setAttribute('readonly','readonly');

    const activate=(ev)=>{
      ev.preventDefault();
      el.removeAttribute('readonly');
      openCustomKeypad(el);
      // Reapply readonly after focus so iPad keyboard doesn't appear.
      setTimeout(()=>el.setAttribute('readonly','readonly'),0);
    };

    el.addEventListener('pointerup',activate);
    el.addEventListener('click',activate);
  });
}

document.addEventListener('pointerdown',e=>{
  const kp=e.target.closest('#customNumericKeypad');
  const numeric=e.target.closest('input[data-custom-keypad="1"], .pickerQtyInput');
  if(!kp && !numeric && customKeypadTarget){
    closeCustomKeypad();
  }
});

function applyKeyboardHints(scope=document){
  scope.querySelectorAll('input,textarea').forEach(el=>{
    const id=el.id||'';
    const numericIds=['qty','total','unitRate','usdAed','eurUsd','usdQar','usdTry','omrAed','targetQtyInput'];

    if(numericIds.includes(id) || el.classList.contains('pickerQtyInput')){
      el.setAttribute('inputmode','none');
      el.setAttribute('data-custom-keypad','1');
      el.setAttribute('pattern','[0-9۰-۹.,]*');
      el.setAttribute('dir','ltr');
    }else if(id==='party' || id==='note' || id==='customCurrencyName'){
      el.setAttribute('inputmode','text');
      el.setAttribute('lang','fa');
      el.setAttribute('dir','rtl');
      el.setAttribute('autocapitalize','none');
      el.setAttribute('spellcheck','false');
    }
  });
}

function installEditableFocusFix(scope=document){
  const editableSelector='input:not([type="checkbox"]):not([type="file"]):not([disabled]), textarea:not([disabled])';

  scope.querySelectorAll(editableSelector).forEach(el=>{
    el.removeAttribute('readonly');
    el.style.pointerEvents='auto';

    if(el.dataset.nativeFocusReady==='1') return;
    el.dataset.nativeFocusReady='1';

    const revealFocusedField=()=>{
      const run=()=>{
        if(document.activeElement!==el)return;
        const panel=el.closest('.panel') || el;
        const rect=panel.getBoundingClientRect();
        const vv=window.visualViewport;
        const viewportTop=vv ? vv.offsetTop : 0;
        const viewportBottom=viewportTop + (vv ? vv.height : window.innerHeight);
        const safeTop=viewportTop+70;
        const safeBottom=viewportBottom-24;

        if(rect.bottom>safeBottom){
          window.scrollBy({top:rect.bottom-safeBottom+24,behavior:'smooth'});
        }else if(rect.top<safeTop){
          window.scrollBy({top:rect.top-safeTop-16,behavior:'smooth'});
        }
      };
      requestAnimationFrame(run);
      setTimeout(run,180);
      setTimeout(run,420);
    };

    el.addEventListener('focus',revealFocusedField,{passive:true});
  });
}

if(window.visualViewport){
  window.visualViewport.addEventListener('resize',()=>{
    const el=document.activeElement;
    if(el && (el.matches('input') || el.matches('textarea'))){
      setTimeout(()=>el.scrollIntoView({block:'center',behavior:'smooth'}),100);
    }
  });
}


let goldCalcLastEdited=null;
let goldCalcLock=false;
let goldCalcPreviousEdited=null;

function setGoldCalcStatus(message,type=''){
  const el=document.getElementById('goldCalcStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='goldCalcStatus'+(type?` ${type}`:'');
}

function setFieldNumericValue(id,value,decimals=3){
  const el=document.getElementById(id);
  if(!el)return;
  if(!Number.isFinite(value)){
    el.value='';
    return;
  }
  el.value=formatGroupedNumber(value,decimals);
}

function goldValues(){
  const q=parseLooseNumber(document.getElementById('qty')?.value);
  const t=parseLooseNumber(document.getElementById('total')?.value);
  const r=parseLooseNumber(document.getElementById('unitRate')?.value);
  return {q,t,r,
    hasQ:Number.isFinite(q)&&q>0,
    hasT:Number.isFinite(t)&&t>0,
    hasR:Number.isFinite(r)&&r>0
  };
}

function recalcGoldLinkedFields(changedId){
  if(goldCalcLock || entryType!=='GOLD')return;

  const qtyEl=document.getElementById('qty');
  const totalEl=document.getElementById('total');
  const rateEl=document.getElementById('unitRate');
  if(!qtyEl||!totalEl||!rateEl)return;

  goldCalcPreviousEdited=goldCalcLastEdited;
  goldCalcLastEdited=changedId;

  let {q,t,r,hasQ,hasT,hasR}=goldValues();

  goldCalcLock=true;
  try{
    if(changedId==='qty'){
      // Changing weight: preserve rate if available; otherwise preserve total.
      if(hasQ && hasR){
        setFieldNumericValue('total',q*r,0);
        setGoldCalcStatus('مبلغ کل = وزن × نرخ واحد','ok');
      }else if(hasQ && hasT){
        setFieldNumericValue('unitRate',t/q,0);
        setGoldCalcStatus('نرخ واحد = مبلغ کل ÷ وزن','ok');
      }else{
        setGoldCalcStatus(hasQ?'برای محاسبه نرخ واحد یا مبلغ کل را وارد کن.':'وزن باید بیشتر از صفر باشد.',hasQ?'':'warn');
      }
    }else if(changedId==='total'){
      // Changing total: preserve rate if available; otherwise preserve weight.
      if(hasT && hasR){
        setFieldNumericValue('qty',t/r,3);
        setGoldCalcStatus('وزن = مبلغ کل ÷ نرخ واحد','ok');
      }else if(hasT && hasQ){
        setFieldNumericValue('unitRate',t/q,0);
        setGoldCalcStatus('نرخ واحد = مبلغ کل ÷ وزن','ok');
      }else{
        setGoldCalcStatus(hasT?'برای محاسبه نرخ واحد یا وزن را وارد کن.':'مبلغ کل باید بیشتر از صفر باشد.',hasT?'':'warn');
      }
    }else if(changedId==='unitRate'){
      // Changing rate:
      // If total was edited most recently, preserve total and recalc weight.
      // Otherwise preserve weight and recalc total.
      if(hasR && hasT && goldCalcPreviousEdited==='total'){
        setFieldNumericValue('qty',t/r,3);
        setGoldCalcStatus('وزن = مبلغ کل ÷ نرخ واحد','ok');
      }else if(hasR && hasQ){
        setFieldNumericValue('total',q*r,0);
        setGoldCalcStatus('مبلغ کل = وزن × نرخ واحد','ok');
      }else if(hasR && hasT){
        setFieldNumericValue('qty',t/r,3);
        setGoldCalcStatus('وزن = مبلغ کل ÷ نرخ واحد','ok');
      }else{
        setGoldCalcStatus(hasR?'برای محاسبه وزن یا مبلغ کل را وارد کن.':'نرخ واحد باید بیشتر از صفر باشد.',hasR?'':'warn');
      }
    }

    // Always refresh display formatting after a valid calculation.
    const v=goldValues();
    if(v.hasQ) qtyEl.value=formatGroupedNumber(v.q,3);
    if(v.hasT) totalEl.value=formatGroupedNumber(v.t,0);
    if(v.hasR) rateEl.value=formatGroupedNumber(v.r,0);

    const v2=goldValues();
    if(v2.hasQ&&v2.hasT&&v2.hasR){
      const expected=v2.q*v2.r;
      const rel=Math.abs(expected-v2.t)/Math.max(v2.t,1);
      if(rel>0.001){
        setGoldCalcStatus('اعداد با هم سازگار نیستند؛ آخرین ورودی مبنای محاسبه قرار گرفت.','warn');
      }
    }
  }finally{
    goldCalcLock=false;
  }
}

function installGoldLinkedFields(){
  const ids=['qty','total','unitRate'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el || el.dataset.goldLinkedReady==='1')return;
    el.dataset.goldLinkedReady='1';

    el.addEventListener('input',()=>{
      if(id==='total' || id==='unitRate'){
        el.value=formatGroupedInputValue(el.value,false,0);
      }else{
        el.value=formatGroupedInputValue(el.value,true,3);
      }
      try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}
      recalcGoldLinkedFields(id);
    });

    el.addEventListener('change',()=>recalcGoldLinkedFields(id));
  });
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
  minusBtn.onclick=()=>{qty.value=Math.max(0,(parseLooseNumber(qty.value)||0)-step);qty.dispatchEvent(new Event('input',{bubbles:true}))};
  plusBtn.onclick=()=>{qty.value=(parseLooseNumber(qty.value)||0)+step;qty.dispatchEvent(new Event('input',{bubbles:true}))};

  const chipVals=type==='COIN'?[1,2,5]:type==='GOLD'?[100,250,500]:[1000,5000,10000];
  chips.innerHTML=chipVals.map(x=>`<button data-chip="${x}">${new Intl.NumberFormat('fa-IR').format(x)}${type==='COIN'?' عدد':type==='GOLD'?' گرم':''}</button>`).join('');
  chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{qty.value=b.dataset.chip;qty.dispatchEvent(new Event('input',{bubbles:true}))});



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
      qty.value=formatGroupedNumber(t.qty,3); total.value=t.total?formatGroupedNumber(t.total,0):''; unitRate.value=t.rate?formatGroupedNumber(t.rate,0):'';party.value=t.party||'';note.value=t.note||'';
      normalCoin.checked=t.coinType==='NORMAL';refreshMode();
    }
  }

  installEditableFocusFix(document);
  autoWeight?.classList.add('hidden');
  installGoldLinkedFields();

  saveTrade.onclick=()=>{
    const asset=type==='COIN'?selectedCoin:selectedAsset;
    let q=parseLooseNumber(qty.value)||0,auto=false;
    if(!q&&type==='GOLD'){
      const t=parseLooseNumber(total.value)||0,r=parseLooseNumber(unitRate.value)||0;
      if(t>0&&r>0){q=t/r;auto=true}
    }
    if(!(q>0)){alert('وزن / تعداد / مقدار را وارد کن');return}
    const trade={
      id:editId||Date.now(),
      side:entryBuy?'BUY':'SELL',
      asset,qty:q,total:parseLooseNumber(total.value)||0,rate:parseLooseNumber(unitRate.value)||0,
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
    const target=g.legs.find(x=>x.leg==='TARGET');
    const sources=g.legs.filter(x=>x.leg==='SOURCE');
    if(!target||!sources.length)return '';
    const srcText=sources.map(x=>coverLabel(x.asset,x.qty)).join(' + ');
    return `<article class="reportCard settlementCard">
      <h3>پوشش داخلی</h3>
      <strong>${coverLabel(target.asset,target.qty)}</strong>
      <div class="action">با ${srcText}</div>
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


const editableFocusObserver=new MutationObserver(()=>installEditableFocusFix(document));
const observedView=document.getElementById('view');
if(observedView) editableFocusObserver.observe(observedView,{childList:true,subtree:true});


document.addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('appVersionBadge');
  if(b)b.textContent=`v${BUILD_VERSION}`;
});

document.addEventListener('DOMContentLoaded',()=>applyKeyboardHints(document));
const keyboardHintObserver=new MutationObserver(()=>applyKeyboardHints(document));
const keyboardHintView=document.getElementById('view');
if(keyboardHintView)keyboardHintObserver.observe(keyboardHintView,{childList:true,subtree:true});

document.addEventListener('DOMContentLoaded',()=>installCustomNumericKeypad(document));
const customKeypadObserver=new MutationObserver(()=>installCustomNumericKeypad(document));
const customKeypadView=document.getElementById('view');
if(customKeypadView)customKeypadObserver.observe(customKeypadView,{childList:true,subtree:true});

const goldLinkedObserver=new MutationObserver(()=>installGoldLinkedFields());
const goldLinkedView=document.getElementById('view');
if(goldLinkedView)goldLinkedObserver.observe(goldLinkedView,{childList:true,subtree:true});
