/* v54 phase 1/2: pure deterministic analytics. No network, DOM or writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MoitAnalytics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='v54-phase2-dev';
const BASKET=Object.freeze({version:'proposal-1',approved:false,items:Object.freeze(['f2','r1','s1','o1','m1','p1'].map(id=>Object.freeze({id,quantity:1})))});
function number(raw,{integer=false,positive=false}={}){
 if(raw==null||raw==='')return {state:'missing',value:null};
 if(typeof raw!=='number'&&typeof raw!=='string')return {state:'invalid',value:null};
 let s=String(raw).trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g,'.').replace(/[،٬]/g,',').replace(/[\u00a0\u2009\u202f]/g,' ');
 if(!s)return {state:'missing',value:null};
 if(typeof raw==='string'){
  if(!/^(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?: \d{3})+(?:\.\d+)?)$/.test(s))return {state:'invalid',value:null};
  s=s.replace(/[, ]/g,'');
 }
 const v=Number(s);if(!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER||(integer&&!Number.isSafeInteger(v)))return {state:'invalid',value:null};
 if(positive&&v===0)return {state:'legacyUnknown',value:null};
 return {state:v===0?'observedZero':'observed',value:v};
}
const alias={violTotal:'violationsTotal',actTotal:'actionsTotal'};
function metric(r,field){
 const k=alias[field]||field;
 if(r.missingFields?.includes(k))return {state:'missing',value:null};
 if(r._numericStates?.[field]){const v=r._numericStates[field];if(v.state==='invalid'||v.state==='missing')return v;}
 const positive=/^(usd|sar)/.test(field);const z=number(r[field]??r[k],{integer:!positive,positive});
 let extra=r.extraDataJson;try{if(typeof extra==='string')extra=JSON.parse(extra)}catch{extra=null}const declared=extra?.observationStates?.[k];
 if(declared!==undefined&&declared!==z.state)return {state:'invalid',value:null};
 if(field==='gasTotal'&&z.value===0&&!r.gasRows?.length&&declared!=='observedZero')return {state:'legacyUnknown',value:null};
 return z;
}
function price(r,id,excluded=()=>false){if(excluded(r.directorate,r.visitDate,id))return {state:'excluded',value:null};return number(r.prices?.[id],{positive:true});}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;}
function balanced(entries){const map=new Map();for(const e of entries){if(!map.has(e.dir))map.set(e.dir,[]);map.get(e.dir).push(e.val);}return mean([...map.values()].map(mean));}
function stats(reports,item,excluded){
 const entries=[],states={};for(const r of reports){const z=price(r,item.id,excluded);states[z.state]=(states[z.state]||0)+1;if(z.value!==null)entries.push({dir:r.directorate,date:r.visitDate,val:z.value,reportId:r.reportId||null,revision:r.revision||null});}
 const vals=entries.map(e=>e.val).sort((a,b)=>a-b),byDir=new Map();for(const e of entries){if(!byDir.has(e.dir))byDir.set(e.dir,[]);byDir.get(e.dir).push(e);}
 const groups=[...byDir].map(([dir,rows])=>({dir,avg:mean(rows.map(e=>e.val)),dates:[...new Set(rows.map(e=>e.date))].sort()}));const allDirs=groups.map(g=>g.dir);
 const min=groups.length?Math.min(...groups.map(g=>g.avg)):null,max=groups.length?Math.max(...groups.map(g=>g.avg)):null;
 const minDirs=groups.filter(g=>g.avg===min).map(g=>g.dir),maxDirs=groups.filter(g=>g.avg===max).map(g=>g.dir);
 const sameDates=groups.length>0&&groups.every(g=>canonical(g.dates)===canonical(groups[0].dates));const comparable=groups.length>=2&&sameDates;
 const avg=mean(groups.map(g=>g.avg));return {...item,entries,states,count:entries.length,min,max,minDir:minDirs.join('، ')||'-',maxDir:maxDirs.join('، ')||'-',minDirs,maxDirs,allDirs,uniqueDirCount:allDirs.length,avg,obsAvg:mean(vals),dirBalancedAvg:avg,observedMin:vals[0]??null,observedMax:vals.at(-1)??null,groupStats:groups,comparability:comparable?'aligned_directorates':groups.length<2?'insufficient_directorates':'unaligned_dates',median:vals.length?(vals[Math.floor((vals.length-1)/2)]+vals[Math.ceil((vals.length-1)/2)])/2:null,spread:comparable?max-min:null,spreadPct:comparable?(max-min)/min*100:null};
}
function aggregate(reports,field,average=false){const entries=[];const states={};for(const r of reports){const z=metric(r,field);states[z.state]=(states[z.state]||0)+1;if(z.value!==null)entries.push({dir:r.directorate,val:z.value});}return {value:entries.length?(average?balanced(entries):entries.reduce((s,e)=>s+e.val,0)):null,known:entries.length,total:reports.length,states,directorates:new Set(entries.map(e=>e.dir)).size};}
function basket(prices){const map=new Map(prices.map(x=>[x.id,x]));const components=BASKET.items.map(x=>({id:x.id,quantity:x.quantity,avg:map.get(x.id)?.avg??null}));const covered=components.filter(c=>c.avg!==null);const partial=covered.length?covered.reduce((s,c)=>s+c.avg*c.quantity,0):null;return {definition:BASKET,components,coveredCount:covered.length,complete:covered.length===components.length,cost:covered.length===components.length?partial:null,partial};}
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function validatePeriods(f1,t1,f2,t2){if(![f1,t1,f2,t2].every(validDate))return 'حدد التواريخ الأربعة الصحيحة أولاً';if(f1>t1||f2>t2)return 'تاريخ بداية الفترة يجب ألا يتجاوز نهايتها';if(f1<=t2&&f2<=t1)return 'الفترتان متداخلتان؛ اختر فترتين منفصلتين';return null;}
function change(a,b){return a==null||b==null?{difference:null,pct:null}:{difference:b-a,pct:a===0?null:(b-a)/a*100};}
function coverage(reports,catalog,dirs,excluded,computedPrices){const pp=computedPrices||catalog.map(i=>stats(reports,i,excluded));const active=dirs.filter(d=>reports.some(r=>r.directorate===d));return {reports:reports.length,directorates:active,missingDirectorates:dirs.filter(d=>!active.includes(d)),directoratePct:dirs.length?active.length/dirs.length*100:null,items:pp.filter(p=>p.count).length,itemPct:catalog.length?pp.filter(p=>p.count).length/catalog.length*100:null,observations:pp.reduce((s,p)=>s+p.count,0)};}
function canonical(x){if(x===undefined)return 'null';if(x===null||typeof x!=='object')return JSON.stringify(x);if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';}
// Exact canonical source key, not a cryptographic hash; comparison avoids hash collisions.
function snapshotKey(reports,scope,exclusions=[],evidence=[]){return canonical({version:VERSION,basket:BASKET.version,scope,reports:reports.slice().sort((a,b)=>canonical(a).localeCompare(canonical(b))),exclusions:[...exclusions].sort(),evidence});}
function simulate(base,target,elasticity,prices){if(!Number.isFinite(base)||base<=0||!Number.isFinite(target)||target<=0||!Number.isFinite(elasticity)||elasticity<0||elasticity>1)return {valid:false,rows:[],fxPct:null};const ratio=target/base-1;if(!Number.isFinite(ratio))return {valid:false,rows:[],fxPct:null};return {valid:true,fxPct:ratio*100,rows:prices.filter(p=>p.avg>0).map(p=>{const fair=p.avg*(1+elasticity*ratio);return {...p,fair,diff:fair-p.avg,pct:(fair-p.avg)/p.avg*100};})};}
// Registry: each measure has a fixed aggregation, unit and source.
const REGISTRY=Object.freeze(Object.fromEntries(Object.entries({reports:['عدد التقارير','تقرير',null,'count'],firms:['زيارات المنشآت المصرح بها','زيارة','firmsCovered','sum'],violations:['المخالفات المصرح بها','مخالفة','violTotal','sum'],actions:['الإجراءات المصرح بها','إجراء','actTotal','sum'],violatingFirms:['المنشآت المخالفة المصرح بها','منشأة','violatingFirms','sum'],gas:['الغاز المرصود','أسطوانة','gasTotal','sum'],usdSell:['بيع الدولار','ريال/دولار','usdSell','balanced'],usdBuy:['شراء الدولار','ريال/دولار','usdBuy','balanced'],sarSell:['بيع السعودي','ريال/سعودي','sarSell','balanced'],sarBuy:['شراء السعودي','ريال/سعودي','sarBuy','balanced'],price:['سعر الصنف','ريال/عبوة',null,'balanced'],evidence:['سجلات الأدلة','سجل',null,'count'],recalls:['ضبطيات الحملات','سجل',null,'count'],recallKg:['وزن الضبطيات','كجم',null,'sum']}).map(([k,[label,unit,field,method]])=>[k,Object.freeze({label,unit,field,method})])));
function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function inScope(r,scope,dateKey='visitDate'){return (!scope.dirs||scope.dirs.includes(r.directorate))&&validDate(r[dateKey])&&(!scope.from||r[dateKey]>=scope.from)&&(!scope.to||r[dateKey]<=scope.to);}
function checksum(s){let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return (h>>>0).toString(16).padStart(8,'0');}
function snapshot({reports=[],catalog=[],dirs=[],scope={},evidence=[],recalls=[],exclusions=[],meta={},excluded=()=>false}){
 const sc={from:scope.from||'',to:scope.to||'',dirs:(scope.dirs||dirs).slice()};
 if((sc.from&&!validDate(sc.from))||(sc.to&&!validDate(sc.to))||(sc.from&&sc.to&&sc.from>sc.to)||sc.dirs.some(d=>!dirs.includes(d)))throw Error('نطاق غير صالح');
 const rr=clone(reports.filter(r=>inScope(r,sc))),ee=clone(evidence.filter(r=>inScope(r,sc)&&(!r.recordState||r.recordState==='ACTIVE'))),cc=clone(recalls.filter(r=>inScope(r,sc,'date'))),cat=clone(catalog);
 const xx=[];for(const r of rr)for(const i of cat)if(excluded(r.directorate,r.visitDate,i.id))xx.push([r.directorate,r.visitDate,i.id]);
 const keys=new Set(xx.map(x=>canonical(x)));const exc=(d,t,i)=>keys.has(canonical([d,t,i]));
 const prices=cat.map(i=>stats(rr,i,exc));const cov=coverage(rr,cat,sc.dirs,exc,prices);const metrics=Object.fromEntries(Object.entries(REGISTRY).filter(([,m])=>m.field).map(([k,m])=>[k,aggregate(rr,m.field,m.method==='balanced')]));
 const key=snapshotKey(rr,{scope:sc,catalog:cat,meta,recalls:cc,exclusions:xx},exclusions,ee);
 return freeze({snapshotId:VERSION+'-'+checksum(key),key,scope:sc,meta:clone(meta),reports:rr,evidence:ee,recalls:cc,catalog:cat,exclusions:xx,prices,coverage:cov,metrics,basket:basket(prices),reportRefs:rr.map(r=>({reportId:r.reportId||null,revision:r.revision||null,date:r.visitDate,directorate:r.directorate})),weightingPolicy:'equal-directorate-mean',basketVersion:BASKET.version});
}
// Rates refer exclusively to distinct reviewed and eligible evidence, not all declared violations.
function verifiedFollowup(reports,evidence){const byReport=new Map(reports.filter(r=>r.reportId).map(r=>[r.reportId,r]));const groups=new Map();for(const e of evidence){const rep=byReport.get(e.reportId);if(!rep||e.recordState!=='ACTIVE'||!e.violationId||e.directorate!==rep.directorate||e.visitDate!==rep.visitDate)continue;if(!groups.has(e.violationId))groups.set(e.violationId,[]);groups.get(e.violationId).push(e);}let eligible=0,resolved=0,unreviewed=0,excluded=0;for(const rows of groups.values()){if(rows.length!==1){unreviewed++;continue;}const e=rows[0],rep=byReport.get(e.reportId);if(!e.reviewEnabled||!e.reviewReference||Number(e.reviewReportRevision)!==Number(rep.revision)){unreviewed++;continue;}if(e.reviewState==='NON_VIOLATION'){excluded++;continue;}if(!['CONFIRMED_OPEN','CONFIRMED_RESOLVED'].includes(e.reviewState)){unreviewed++;continue;}eligible++;if(e.reviewState==='CONFIRMED_RESOLVED')resolved++;}return {eligible,resolved,unreviewed,excluded,rate:eligible?resolved/eligible*100:null};}
function auditSnapshot(s){const flags=[];const add=(code,text,refs=[])=>flags.push({code,text,refs});const c=s.coverage;
 if(c.missingDirectorates.length)add('missing_dirs','مديريات بلا تقارير في النطاق: '+c.missingDirectorates.join('، '));
 if(c.items<s.catalog.length)add('missing_prices','أصناف غير مرصودة: '+(s.catalog.length-c.items)+' من '+s.catalog.length);
 if(s.metrics.usdSell.value===null)add('usd_missing','سعر بيع الدولار غير مرصود');
 if(s.metrics.gas.value===null||s.metrics.gas.known<s.reports.length)add('gas_unknown','رصد الغاز غير مثبت أو ناقص؛ لا يُفسر الغياب بأنه صفر توزيع');
 if(!s.basket.complete)add('basket_missing','السلة المقترحة غير مكتملة: '+s.basket.components.filter(x=>x.avg===null).map(x=>s.catalog.find(i=>i.id===x.id)?.name+' '+s.catalog.find(i=>i.id===x.id)?.unit).join('، '));
 for(const r of s.reports){const ref=[r.reportId||r.directorate+' '+r.visitDate],f=metric(r,'firmsCovered').value,v=metric(r,'violTotal').value,a=metric(r,'actTotal').value;
 if(f===0&&v>0)add('firms_viols',r.directorate+' '+r.visitDate+': مخالفات مصرح بها مع صفر زيارات منشآت؛ يحتاج مراجعة.',ref);
 if(v===0&&a>0)add('general_action',r.directorate+' '+r.visitDate+': إجراءات دون مخالفات؛ قد تكون رقابة عامة، يلزم التصنيف.',ref);
 if(a===null||f===null||v===null)add('missing_counts',r.directorate+' '+r.visitDate+': حقول عد ناقصة أو غير صالحة.',ref);
 for(const [k,m] of Object.entries(REGISTRY))if(m.field&&metric(r,m.field).state==='invalid')add('invalid_numeric',r.directorate+' '+r.visitDate+': قيمة غير صالحة في '+m.label,ref);
 for(const i of s.catalog)if(price(r,i.id).state==='invalid')add('invalid_price',r.directorate+' '+r.visitDate+': سعر غير صالح: '+i.name+' '+i.unit,ref);
 }
 const seenEvidence=new Set(),reportIds=new Set(s.reports.map(r=>r.reportId).filter(Boolean));for(const e of s.evidence){const ref=[e.violationId||e.reportId||'سجل دليل'];if(e.violationId&&seenEvidence.has(e.violationId))add('duplicate_evidence','معرف دليل مكرر؛ يلزم التدقيق.',ref);if(e.violationId)seenEvidence.add(e.violationId);if(!e.reportId||!reportIds.has(e.reportId))add('unlinked_evidence','دليل دون رابط تقرير متاح في النطاق؛ يحتاج مراجعة الرابط.',ref);if(/إحضار|احضار/.test(String(e.type||e.violationType||'')))add('evidence_classification','سجل أمر إحضار يحتاج تصنيفًا؛ لا يعد مخالفة تلقائيًا.',ref);}
 for(const p of s.prices){const byDay=new Map();for(const e of p.entries){if(!byDay.has(e.date))byDay.set(e.date,[]);byDay.get(e.date).push(e);}for(const entries of byDay.values()){if(entries.length<5||new Set(entries.map(e=>e.dir)).size<5)continue;const vals=entries.map(e=>e.val).sort((a,b)=>a-b),median=a=>(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;const med=median(vals),mad=median(vals.map(v=>Math.abs(v-med)).sort((a,b)=>a-b));if(mad>0)for(const e of entries)if(Math.abs(e.val-med)*0.67449/mad>3.5)add('outlier_candidate',p.name+' '+p.unit+' — '+e.dir+' '+e.date+': قيمة مرشحة للمراجعة وليست خطأ مثبتًا.',[e.reportId].filter(Boolean));}}
 return flags;
}
return Object.freeze({VERSION,BASKET,number,metric,price,stats,aggregate,basket,validDate,validatePeriods,change,coverage,snapshotKey,simulate,REGISTRY,snapshot,inScope,auditSnapshot,verifiedFollowup,canonical});
});
