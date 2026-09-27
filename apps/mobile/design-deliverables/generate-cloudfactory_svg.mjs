import fs from 'node:fs';

const W = 6800;
const H = 5600;
const C = {
  canvas: '#D8DCD7', paper: '#F8F8F4', ink: '#17201B', muted: '#5E6A63',
  line: '#CCD2CC', soft: '#EEF0EB', dark: '#20352A', green: '#2F6B4F',
  greenSoft: '#DCEBE2', blue: '#245A86', blueSoft: '#DCE9F3', amber: '#9A641C',
  amberSoft: '#F4E7CF', red: '#9B3A32', redSoft: '#F3DDDA', white: '#FFFFFF'
};
const out = [];
const e = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rect = (x,y,w,h,fill=C.white,stroke='none',r=8,sw=1) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
const txt = (x,y,s,size=14,weight=400,fill=C.ink,anchor='start',family='Inter, Arial, sans-serif') => out.push(`<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${e(s)}</text>`);
const line = (x1,y1,x2,y2,stroke=C.line,sw=1,dash='') => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash?`stroke-dasharray="${dash}"`:''}/>`);
const circle = (x,y,r,fill=C.white,stroke='none',sw=1) => out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
const group = (id, fn, transform='') => { out.push(`<g id="${id}"${transform?` transform="${transform}"`:''}>`); fn(); out.push('</g>'); };
const lines = (x,y,items,size=14,gap=22,fill=C.ink,weight=400) => items.forEach((s,i)=>txt(x,y+i*gap,s,size,weight,fill));
const pill = (x,y,label,kind='neutral') => { const map={neutral:[C.soft,C.muted],green:[C.greenSoft,C.green],blue:[C.blueSoft,C.blue],amber:[C.amberSoft,C.amber],red:[C.redSoft,C.red]}; const [bg,fg]=map[kind]; const w=Math.max(74,label.length*7.2+22); rect(x,y,w,28,bg,'none',14); txt(x+11,y+19,label,12,600,fg); return w; };
const card = (x,y,w,h,title,sub='') => { rect(x,y,w,h,C.white,C.line,10); txt(x+20,y+30,title,15,650,C.ink); if(sub) txt(x+20,y+51,sub,12,400,C.muted); };
const metric = (x,y,w,label,value,note,kind='neutral') => { card(x,y,w,104,label); txt(x+20,y+72,value,28,700,kind==='green'?C.green:kind==='red'?C.red:C.ink); if(note) txt(x+w-18,y+72,note,11,500,C.muted,'end'); };
const pageTitle = (x,y,num,title,kicker) => { pill(x,y-27,num,'green'); txt(x+78,y-5,title,28,700,C.ink); txt(x+78,y+21,kicker,13,450,C.muted); };
const arrow = (x1,y1,x2,y2,color=C.green) => { line(x1,y1,x2,y2,color,2); out.push(`<path d="M ${x2-8} ${y2-5} L ${x2} ${y2} L ${x2-8} ${y2+5}" fill="none" stroke="${color}" stroke-width="2"/>`); };
const bar = (x,y,w,pct,label,count,color=C.green) => { txt(x,y,label,13,600,C.ink); txt(x+w,y,count,12,600,C.muted,'end'); rect(x,y+10,w,10,C.soft,'none',5); rect(x,y+10,w*pct,10,color,'none',5); };

out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
rect(0,0,W,H,C.canvas,'none',0);
out.push('<defs><style>text{dominant-baseline:auto} .focus{stroke:#245A86;stroke-width:3}</style></defs>');

// PAGE 00
group('00_STORY_AND_APPROACH',()=>{
  const x=80,y=80,w=1580,h=5440;
  rect(x,y,w,h,C.paper,'none',16);
  pageTitle(x+56,y+70,'00','Story and approach','Source-grounded reasoning and explicit assumptions');
  rect(x+56,y+126,w-112,264,C.dark,'none',12);
  pill(x+88,y+158,'CLOUDFACTORY CASE STUDY','blue');
  txt(x+88,y+226,'Smart Exception Hub',42,750,C.white);
  txt(x+88,y+267,'Opeyemi Ajimati  /  Senior Product Designer take-home',16,450,'#DCE6DF');
  lines(x+88,y+324,[
    'Not every exception is a review task.',
    'First ask whether the source can support a safe decision; then route by cause,',
    'repeatability, risk and SLA.'
  ],18,28,C.white,600);
  pill(x+1220,y+326,'START PROTOTYPE', 'green');

  txt(x+56,y+448,'Brief-derived operating picture',20,700,C.ink);
  metric(x+56,y+476,270,'Daily volume','120,000','brief');
  metric(x+342,y+476,270,'Auto-approved','86,400','72%','green');
  metric(x+628,y+476,270,'Borderline','25,200','21%');
  metric(x+914,y+476,270,'Critical','8,400','7%','red');
  metric(x+1200,y+476,292,'Human review','33,600','28%');
  metric(x+56,y+596,350,'Current workload','2,352 h/day','Calculated from the brief');
  metric(x+422,y+596,350,'At 1.5 min target','840 h/day','Not a measured outcome','green');
  card(x+788,y+596,704,104,'Plain-language implication');
  lines(x+808,y+650,['The target requires prevention, controlled batches and faster','individual review together. No single root cause proves the target.'],13,20,C.ink,500);

  txt(x+56,y+770,'Evidence-sufficiency routing model',20,700,C.ink);
  const gx=x+56, gy=y+802;
  card(gx,gy,310,166,'Gate 1  /  Enough evidence?','Never ask a reviewer to guess.');
  pill(gx+20,gy+78,'NO','red'); lines(gx+82,gy+96,['Use alternate source','Request clearer source','Escalate upstream'],12,20,C.ink,500);
  pill(gx+20,gy+136,'YES','green');
  arrow(gx+310,gy+83,gx+360,gy+83);
  card(gx+360,gy,310,166,'Gate 2  /  Repeated pattern?','Check homogeneity and outliers.');
  pill(gx+380,gy+78,'YES','green'); lines(gx+442,gy+96,['Representative samples','Staged batch','Audit + rollback'],12,20,C.ink,500);
  pill(gx+380,gy+136,'NO','neutral');
  arrow(gx+670,gy+83,gx+720,gy+83);
  card(gx+720,gy,350,166,'Gate 3  /  Uncertainty + consequence','Confidence is not business risk.');
  lines(gx+740,gy+82,['Borderline: suggestion + quick verification','Critical/readable: independent review hypothesis','Critical/unreadable: source return'],12,23,C.ink,500);
  arrow(gx+1070,gy+83,gx+1120,gy+83);
  card(gx+1120,gy,316,166,'Governed learning loop','No automatic production retraining.');
  lines(gx+1140,gy+82,['Human resolution -> QA','Pattern analysis -> action','Controlled release -> monitor'],12,23,C.ink,500);

  txt(x+56,y+1040,'Root cause -> safest next action',20,700,C.ink);
  card(x+56,y+1068,1436,260,'Cause-aware action map','All volumes are calculated from the brief.');
  const rows=[
    ['Ambiguous formatting','41%','13,776/day','Open recurring cluster','Batch only when samples support it'],
    ['Low-resolution input','28%','9,408/day','Inspect source-quality issue','Recover or return if evidence is insufficient'],
    ['Threshold sensitivity','18%','6,048/day','Request calibration review','Production approval remains separate'],
    ['Multi-entity labels','13%','4,368/day','Review guideline ambiguity','Review + structured guideline feedback']
  ];
  rows.forEach((r,i)=>{ const yy=y+1138+i*43; if(i%2===0) rect(x+72,yy-26,1404,38,C.soft,'none',4); txt(x+88,yy,r[0],13,650); txt(x+360,yy,r[1],13,650,C.muted); txt(x+440,yy,r[2],13,500,C.muted); txt(x+650,yy,r[3],13,650,C.blue); txt(x+1000,yy,r[4],12,450,C.muted); });

  txt(x+56,y+1390,'Directional sensitivity model - not a forecast',20,700,C.ink);
  card(x+56,y+1418,1436,342,'Blended human handling minutes per original flagged item','Excludes QA, rework, replacement-source latency and governance overhead.');
  const sy=y+1492;
  ['Scenario','Formatting batchable','Low-res recovered','Threshold prevented','Blended time','Human h/day'].forEach((h,i)=>txt(x+[88,320,560,790,1050,1250][i],sy,h,12,650,C.muted));
  const scenarios=[['Conservative','70%','70%','60%','2.05 min','1,148 h'],['Target case','85%','90%','85%','1.45 min','811 h'],['Optimistic','90%','100%','100%','1.17 min','654 h']];
  scenarios.forEach((r,i)=>{ const yy=sy+48+i*52; rect(x+72,yy-27,1404,42,i===1?C.greenSoft:(i%2?C.white:C.soft),'none',5); r.forEach((v,j)=>txt(x+[88,320,560,790,1050,1250][j],yy,v,13,j===0||j>=4?650:500,i===1&&j>=4?C.green:C.ink)); });
  lines(x+88,sy+228,['Target case clears 1.5 minutes only under ambitious, testable assumptions.','Business-case hypothesis, not measured impact.'],12,20,C.red,600);
  pill(x+980,sy+210,'CALCULATED ASSUMPTION CHECK','amber');
  lines(x+980,sy+260,['Above 1.5 min if formatting eligibility < ~82%','or low-res recover/return < ~84%','or safe threshold prevention < ~78%'],11,18,C.muted,500);

  txt(x+56,y+1825,'Metric definitions and quality guardrails',20,700,C.ink);
  card(x+56,y+1853,1436,182,'Three denominators - do not mix them');
  lines(x+88,y+1912,['1. Blended human handling minutes per flagged item - sensitivity model','2. Active review time per individually reviewed item - Reviewer efficiency','3. End-to-end exception resolution time - includes source replacement and escalation'],13,25,C.ink,500);
  lines(x+840,y+1912,['Guardrails: QA agreement, rework, critical escape,','batch rollback, disagreement detection, explanation comprehension'],12,22,C.muted,500);

  txt(x+56,y+2100,'People, principles and scope',20,700,C.ink);
  card(x+56,y+2128,690,230,'Reviewer job','Make a defensible decision without guessing or blindly following the model.');
  lines(x+80,y+2195,['Needs: fast orientation, exact evidence, flag reason,','keyboard acceleration, autosave, undo, escalation,','low cognitive fatigue.'],13,24,C.ink,500);
  card(x+762,y+2128,730,230,'Operations Lead job','See cause, workflow impact and the safest next action before backlog grows.');
  lines(x+786,y+2195,['Needs: normalised rates, root-cause impact, SLA risk,','source/model patterns, team quality signals, governed','intervention paths.'],13,24,C.ink,500);
  card(x+56,y+2374,690,274,'Five design principles');
  lines(x+80,y+2435,['1. Explain before asking for action.','2. Never infer evidence that is not present.','3. Confidence is not consequence.','4. Batch with evidence, holdbacks, audit and rollback.','5. Preserve control and work through failure.'],13,32,C.ink,500);
  card(x+762,y+2374,730,274,'Deliberate cuts');
  lines(x+786,y+2435,['Mobile / dark mode / onboarding / full RBAC','Workforce scheduling / direct threshold deployment','Automatic retraining / broad design system','Large coded prototype / polished competitive teardown'],13,28,C.ink,500);

  txt(x+56,y+2710,'What I would validate next',20,700,C.ink);
  card(x+56,y+2738,1436,260,'Decision-oriented questions and measures');
  lines(x+80,y+2798,['Does cause-first routing reduce search time?','What cluster threshold is safe enough for batching?','Does independent review reduce anchoring without unacceptable delay?','Do reviewers understand provenance and field confidence?','Which fatigue intervention helps without feeling punitive?'],13,30,C.ink,500);
  lines(x+790,y+2798,['Measure: time to understand, time to decision, QA agreement','Escalation rate, batch false-positive rate, rollback rate','Explanation comprehension, disagreement detection','Error rate by continuous session duration'],13,30,C.muted,500);
  pill(x+56,y+3050,'ASSUMPTION','neutral'); pill(x+170,y+3050,'DESIGN HYPOTHESIS','blue'); pill(x+344,y+3050,'CALCULATED FROM BRIEF','green'); pill(x+562,y+3050,'ILLUSTRATIVE SAMPLE','amber');
  card(x+56,y+3100,1436,224,'Assumptions used');
  lines(x+80,y+3160,['Enterprise multi-project environment with role-based access.','Source documents and extracted fields can be shown side-by-side.','Confidence exists at item and field level.','Operations Leads request changes; production deployment has separate approval.','Batching requires a consistent cluster and authorised sample verification.','Corrections can be stored as structured feedback and audit events.'],12,25,C.ink,500);
},'');

// Reusable screen chrome
const screen = (id,x,y,title,subtitle,body) => group(id,()=>{
  rect(x,y,1440,1024,C.paper,C.line,14,2);
  rect(x,y,220,1024,C.dark,'none',14);
  txt(x+32,y+58,'EXCEPTION HUB',13,700,C.white);
  lines(x+32,y+122,['Operations','Queues','Clusters','Feedback','Audit'],13,48,'#C9D7CE',500);
  rect(x+16,y+95,188,44,'#2C4939','none',7);
  txt(x+32,y+123,'Operations',13,650,C.white);
  txt(x+260,y+58,title,25,700,C.ink);
  txt(x+260,y+84,subtitle,13,450,C.muted);
  pill(x+1180,y+34,'Invoice extraction','neutral');
  line(x+220,y+110,x+1440,y+110,C.line,1);
  body(x+260,y+142);
});

// PAGE 01
group('01_CORE_EXPERIENCE',()=>{
  const ox=1700, oy=80;
  rect(ox,oy,5020,3460,C.paper,'none',16);
  pageTitle(ox+56,oy+70,'01','Core experience','Four editable 1440 x 1024 hero screens');
  pill(ox+430,oy+43,'LOCAL COMPONENTS: BUTTON / BADGE / BANNER / TABLE ROW / DIALOG / TOAST','neutral');

  screen('Screen-1-Operations-Lead-Dashboard',ox+56,oy+130,'Exception operations','Today - Invoice extraction', (x,y)=>{
    metric(x,y,250,'Exceptions today','33,600','Calculated');
    metric(x+266,y,220,'Current average','4.2 min','Target < 1.5');
    metric(x+502,y,250,'Review workload','2,352 h/day','Calculated');
    card(x+768,y,372,104,'Confidence distribution');
    bar(x+790,y+35,318,.72,'Auto-approved 72%','86,400',C.green);
    bar(x+790,y+65,318,.21,'Borderline 21%','25,200',C.amber);
    bar(x+790,y+95,318,.07,'Critical 7%','8,400',C.red);
    txt(x,y+148,'What should I investigate or change today?',18,700,C.ink);
    card(x,y+172,820,510,'Root causes and next actions','Counts are calculated from the brief.');
    const rr=[
      ['Ambiguous formatting','41%  /  13,776','Open recurring cluster','green'],
      ['Low-resolution input','28%  /  9,408','Inspect source-quality issue','blue'],
      ['Threshold sensitivity','18%  /  6,048','Request calibration review','amber'],
      ['Multi-entity labels','13%  /  4,368','Review guideline ambiguity','neutral']
    ];
    rr.forEach((r,i)=>{ const yy=y+250+i*92; if(i%2===0) rect(x+18,yy-31,784,76,C.soft,'none',6); txt(x+32,yy,r[0],14,650); txt(x+310,yy,r[1],13,600,C.muted); pill(x+545,yy-24,r[2],r[3]); });
    card(x+836,y+172,304,230,'SLA / backlog risk','Illustrative sample');
    metric(x+856,y+230,264,'Backlog at risk','4,280','Illustrative','red');
    lines(x+856,y+360,['No historical validated','model-accuracy data was','provided in the brief.'],12,20,C.muted,500);
    card(x+836,y+418,304,264,'Team fatigue signal');
    pill(x+856,y+470,'34% ERROR INCREASE','amber');
    lines(x+856,y+528,['After two continuous hours.','Team-level signal only.','No individual speed ranking.'],12,23,C.ink,500);
    rect(x+856,y+608,260,44,C.blueSoft,C.blue,7); txt(x+986,y+636,'Review break coverage','12',650,C.blue,'middle');
  });

  screen('Screen-2-Cluster-Review',ox+1552,oy+130,'Recurring invoice date pattern','Illustrative cluster - 324 affected invoices', (x,y)=>{
    pill(x,y,'PATTERN: DD/MM INTERPRETED AS MM/DD','amber');
    txt(x,y+62,'Why these items were grouped',18,700);
    lines(x,y+91,['Same supplier template, same date position, same extraction conflict.','Cluster confidence supports review - not automatic correction.'],13,22,C.muted,500);
    card(x,y+140,760,366,'Representative samples','12 reviewed  /  highlighted source evidence');
    for(let i=0;i<6;i++){ const cx=x+20+(i%3)*244, cy=y+205+Math.floor(i/3)*132; rect(cx,cy,224,108,C.soft,C.line,6); txt(cx+12,cy+23,`INV-26-${1842+i}`,11,650,C.muted); rect(cx+14,cy+38,118,24,C.amberSoft,C.amber,3); txt(cx+23,cy+55,['12/09/2026','09/12/2026','14/09/2026','18/09/2026','21/09/2026','27/09/2026'][i],13,700,C.ink); txt(cx+14,cy+86,i===5?'OUTLIER - stamp overlap':'Supplier: Nordlicht GmbH',11,500,i===5?C.red:C.muted); }
    card(x+780,y+140,360,366,'Proposed normalisation rule','Human verified before any batch.');
    lines(x+800,y+205,['If supplier template = Nordlicht-v4','and date region uses DD/MM/YYYY,','normalise to ISO YYYY-MM-DD.'],13,25,C.ink,600);
    pill(x+800,y+300,'12 / 12 SAMPLES REVIEWED','green');
    metric(x+800,y+346,150,'Expected','309','resolve','green');
    metric(x+960,y+346,160,'Held','15','outliers','red');
    card(x,y+530,1140,170,'Apply as staged batch','Canary 10% first; stop on unexpected disagreement.');
    pill(x+20,y+606,'APPLY STAGED BATCH','green'); pill(x+205,y+606,'ADJUST RULE','neutral'); pill(x+325,y+606,'SEND ALL TO REVIEW','red');
    lines(x+640,y+603,['Audit event created before application.','Rollback remains available after completion.'],12,21,C.muted,500);
    rect(x+740,y+724,400,170,C.white,C.dark,10,2); txt(x+764,y+760,'Confirm staged batch',17,700); lines(x+764,y+795,['31 invoices apply in the first canary.','293 remain paused. 15 outliers stay in review.'],12,21,C.ink,500); pill(x+764,y+842,'CANCEL','neutral'); pill(x+862,y+842,'CONFIRM CANARY','green');
  });

  screen('Screen-3-Reviewer-Borderline',ox+56,oy+1210,'Invoice review','Held items  3 of 15  /  Autosaved  /  Session 1h 47m', (x,y)=>{
    card(x,y,640,742,'Source evidence','Invoice INV-26-1847 - Nordlicht GmbH');
    rect(x+22,y+76,596,610,'#F3F0E8',C.line,4);
    txt(x+56,y+126,'NORDLICHT GMBH',20,750,C.dark); txt(x+56,y+158,'Rechnung / Invoice',14,500,C.muted);
    lines(x+56,y+220,['Invoice no.  INV-26-1847','Supplier ID  NL-04419','Subtotal     EUR 12,440.00','VAT          EUR 2,363.60','Total        EUR 14,803.60'],15,36,C.ink,500);
    rect(x+50,y+398,300,74,C.amberSoft,C.amber,3,2); txt(x+66,y+427,'Invoice date',12,600,C.muted); txt(x+66,y+454,'12/09/2026',22,750,C.ink); txt(x+380,y+432,'SUPPLIER STAMP',12,650,C.red); circle(x+450,y+430,56,'none',C.red,2);
    card(x+664,y,476,742,'Decision workspace','Borderline - model suggestion available');
    txt(x+686,y+78,'Why this was flagged',16,700); lines(x+686,y+108,['Two possible invoice dates were found.','The date overlaps a supplier stamp.'],13,23,C.ink,500);
    pill(x+686,y+168,'ITEM CONFIDENCE 68%','amber'); pill(x+870,y+168,'DATE FIELD 72%','amber');
    txt(x+686,y+238,'Model suggestion',13,600,C.muted); rect(x+686,y+256,430,92,C.blueSoft,C.blue,7,2); txt(x+706,y+287,'12 Sep 2026',20,700,C.ink); txt(x+706,y+318,'72% confidence - source region highlighted',12,500,C.muted);
    txt(x+686,y+390,'Check the highlighted source before accepting.',13,600,C.ink);
    pill(x+686,y+426,'ACCEPT  [1]','green'); pill(x+812,y+426,'EDIT  [2]','blue'); pill(x+922,y+426,'ESCALATE  [3]','neutral');
    line(x+686,y+486,x+1118,y+486,C.line); txt(x+686,y+526,'Resolution reason after edit',13,600); rect(x+686,y+545,430,48,C.white,C.line,6); txt(x+702,y+575,'Select a structured reason',12,450,C.muted);
    pill(x+686,y+624,'UNDO  [U]','neutral'); pill(x+810,y+624,'NEXT  [J]','neutral');
    rect(x+686,y+680,430,44,C.amberSoft,'none',6); txt(x+702,y+707,'13 minutes to two hours - reset when practical.',12,600,C.amber);
  });

  screen('Screen-4-Reviewer-Critical',ox+1552,oy+1210,'Independent review','Held items  4 of 15  /  Human decision first', (x,y)=>{
    card(x,y,640,742,'Readable source - unreliable model','Invoice INV-26-1851 - Atelier West');
    rect(x+22,y+76,596,610,'#F4F1E8',C.line,4);
    txt(x+56,y+126,'ATELIER WEST KG',20,750,C.dark); txt(x+56,y+158,'Supplier invoice',14,500,C.muted);
    lines(x+56,y+220,['Invoice no.  AW-90817','Purchase ref. PO-51109','Total        EUR 8,120.40'],15,38,C.ink,500);
    rect(x+50,y+370,340,82,C.blueSoft,C.blue,3,2); txt(x+66,y+402,'Invoice date / Lieferdatum',12,600,C.muted); txt(x+66,y+433,'18.09.2026 / 20.09.2026',20,750,C.ink);
    txt(x+56,y+512,'Both dates are readable; the label is ambiguous.',13,600,C.red);
    card(x+664,y,476,742,'No reliable suggestion','Model confidence below 50%');
    pill(x+686,y+76,'DESIGN HYPOTHESIS','blue');
    lines(x+686,y+132,['The model could not determine the invoice date safely.','Enter your decision from the source. You can compare','with the model afterwards.'],13,23,C.ink,500);
    txt(x+686,y+232,'Your invoice-date decision',13,600,C.muted); rect(x+686,y+252,430,54,C.white,C.blue,6,2); txt(x+704,y+286,'18 Sep 2026',16,600,C.ink);
    pill(x+686,y+330,'SAVE HUMAN DECISION','green');
    rect(x+686,y+388,430,104,C.soft,C.line,7); txt(x+704,y+420,'Compare with model',14,650,C.muted); txt(x+704,y+451,'Available only after your decision is saved.',12,500,C.muted); pill(x+930,y+420,'LOCKED','neutral');
    txt(x+686,y+540,'Feedback classification',13,600); lines(x+686,y+574,['Model extraction error','Ambiguous guideline','New or unsupported pattern'],12,24,C.ink,500);
    pill(x+686,y+666,'ESCALATE','neutral'); pill(x+800,y+666,'UNDO','neutral');
  });
  rect(ox+1552,oy+2254,1440,72,C.blueSoft,C.blue,6,2); txt(ox+1576,oy+2298,'Design hypothesis: test whether independent review reduces anchoring on critical items without causing unacceptable delay.',13,650,C.blue);

  // Partial result state + flow
  card(ox+3048,oy+130,1870,420,'Partial batch result overlay','Illustrative result - no silent failures');
  metric(ox+3080,oy+210,360,'Resolved','309','audit recorded','green');
  metric(ox+3456,oy+210,360,'Held for review','15','inconsistent pattern','red');
  card(ox+3832,oy+210,1054,104,'Reason held','Date labels or stamp overlap did not match the verified rule.');
  pill(ox+3080,oy+346,'REVIEW HELD ITEMS','green'); pill(ox+3260,oy+346,'VIEW AUDIT LOG','neutral'); pill(ox+3420,oy+346,'UNDO BATCH','red');
  txt(ox+3048,oy+620,'Connected prototype path',20,700);
  const flow=['Dashboard','Formatting cluster','Confirm staged batch','Partial result','Held critical item','Save human decision','Compare with model','Classify feedback','Complete'];
  flow.forEach((f,i)=>{ const xx=ox+3048+(i%3)*590, yy=oy+670+Math.floor(i/3)*142; card(xx,yy,520,90,`${i+1}. ${f}`); if(i<flow.length-1) arrow(xx+520,yy+45,xx+570,yy+45); });

  txt(ox+3048,oy+1135,'Local component inventory',20,700);
  card(ox+3048,oy+1165,1870,430,'Components used by hero screens','Editable grouped patterns; no broad design system.');
  const comps=[['Button','Primary / secondary / danger / disabled / loading'],['Status badge','Text + numeric value + icon slot'],['Field row','Untouched / suggestion / edited / conflict / saved'],['Status banner','Information / warning / error / success'],['Action table row','Cause / volume / consequence / next action'],['Dialog + toast','Exact consequence / Undo'],['Sample card','Source snippet / highlight / outlier state'],['Keyboard hint','Optional accelerator, never the only action']];
  comps.forEach((c,i)=>{ const xx=ox+3080+(i%2)*900, yy=oy+1240+Math.floor(i/2)*72; rect(xx,yy,840,54,i%2?C.soft:C.white,C.line,5); txt(xx+16,yy+22,c[0],13,650); txt(xx+230,yy+22,c[1],12,450,C.muted); });
},'');

// PAGE 02
group('02_STATES_AND_TRUST',()=>{
  const x=1700,y=3600,w=3200,h=1920;
  rect(x,y,w,h,C.paper,'none',16);
  pageTitle(x+56,y+70,'02','States and trust','Compact recovery map - work is preserved');
  const states=[
    ['Suggestion loading','Manual review remains available','Work saved','Wait or continue','suggestion_requested','blue'],
    ['Suggestion ready','Accept / edit / escalate','Work saved','Check evidence','suggestion_shown','green'],
    ['Wrong suggestion','Human override','Work saved','Classify reason','human_override','amber'],
    ['Model timeout','Continue manually or escalate','Work saved','Retry later','model_timeout','red'],
    ['Human-model disagreement','Compare evidence','Work saved','Escalate if needed','disagreement_logged','amber'],
    ['Source insufficient','No forced answer','Work saved','Use alternate / request source','source_returned','red'],
    ['Batch applying','View progress','Rule + audit saved','Pause if anomaly','batch_started','blue'],
    ['Partial batch failure','Resolved items identified','All outcomes saved','Hold failures','partial_failure','red'],
    ['Rollback','Audit remains visible','Prior values restored','Review cause','batch_rolled_back','amber'],
    ['Escalation','Manual context retained','Work saved','Route to expert / owner','escalated','neutral']
  ];
  states.forEach((s,i)=>{ const col=i%2,row=Math.floor(i/2),xx=x+56+col*1538,yy=y+132+row*250; card(xx,yy,1480,220,`${i+1}. ${s[0]}`,s[1]); pill(xx+20,yy+70,s[2],s[5]); txt(xx+20,yy+126,'Recovery',11,600,C.muted); txt(xx+132,yy+126,s[3],12,600,C.ink); txt(xx+20,yy+166,'Audit event',11,600,C.muted); txt(xx+132,yy+166,s[4],12,600,C.ink,'start','Geist Mono, monospace'); });
  rect(x+56,y+1400,3020,86,C.redSoft,C.red,8,2); txt(x+84,y+1435,'Fallback service copy',12,650,C.red); txt(x+84,y+1465,'Suggestion unavailable. Continue manually or escalate. Your work is saved.',17,700,C.ink);
  txt(x+56,y+1550,'AI trust model',20,700);
  const trust=['Provenance','Explanation','Uncertainty','Human control','Audit','Governed feedback'];
  trust.forEach((t,i)=>{ const xx=x+56+i*490; card(xx,y+1582,450,140,t); txt(xx+20,y+1660,['Where did it come from?','Why was it flagged?','Estimate, not truth','Accept / edit / reject','What changed and when?','QA before production action'][i],12,500,C.muted); if(i<trust.length-1) arrow(xx+450,y+1650,xx+478,y+1650); });
},'');

// PAGE 03
group('03_PRESENTATION',()=>{
  const x=4940,y=3600,w=1780,h=1920;
  rect(x,y,w,h,C.paper,'none',16);
  pageTitle(x+56,y+70,'03','Presentation','Decision log, honest AI use and walkthrough');
  card(x+56,y+132,w-112,150,'Prototype start','Start at Screen 1 - Exception operations');
  pill(x+80,y+208,'DASHBOARD -> CLUSTER -> STAGED BATCH -> PARTIAL RESULT -> HELD CRITICAL ITEM','green');
  txt(x+56,y+342,'Decision log',20,700);
  card(x+56,y+370,w-112,300,'What I chose - and what I did not claim');
  lines(x+82,y+426,['Cause- and evidence-aware routing over a faster generic queue.','Low-resolution evidence becomes recover/return when a safe decision is impossible.','Production threshold deployment remains outside direct Operations Lead control.','Independent review is a hypothesis, not a universal rule.','Sensitivity model replaces a promised throughput number.','Four hero screens and state coverage over a broad visual system.'],13,40,C.ink,500);
  txt(x+56,y+728,'AI-tool-use reflection - draft for owner review',20,700);
  const cols=[
    ['AI accelerated',['Brief synthesis','Arithmetic scaffolding','Layout alternatives','Illustrative sample data','Component scaffolding','Initial state enumeration']],
    ['Human judgment',['Correcting unsupported claims','Evidence-sufficiency gate','Routing and governance','Scope and hierarchy','Copy and interaction review']],
    ['AI was not used to',['Fabricate research','Invent measured impact','Claim production success','Make unsupervised policy','Hide AI involvement']]
  ];
  cols.forEach((c,i)=>{ const xx=x+56+i*552; card(xx,y+760,520,276,c[0]); lines(xx+22,y+816,c[1],12,32,i===2?C.red:C.ink,500); });
  txt(x+56,y+1098,'Five-minute walkthrough spine',20,700);
  card(x+56,y+1126,w-112,520,'First-person narrative');
  lines(x+82,y+1182,[
    '1. At first this looks like a queue-speed problem. I asked whether every flag should reach a reviewer.',
    '2. I do not ask reviewers to guess when the source cannot support a safe decision.',
    '3. Routing uses evidence sufficiency, repeatability, risk and SLA.',
    '4. The sensitivity model is a testable business case, not promised impact.',
    '5. Operations Leads start with causes and concrete actions.',
    '6. Repeated patterns use samples, outliers, staged application, audit and rollback.',
    '7. Ambiguous items stay in an evidence-first Reviewer workspace.',
    '8. Critical readable items test independent review; unreadable items request better evidence.',
    '9. Corrections become governed feedback, not automatic retraining.',
    '10. Next I would test time, QA agreement, comprehension, source return and rollback.'
  ],12,39,C.ink,500);
  txt(x+56,y+1710,'Owner review before submission',20,700);
  lines(x+82,y+1760,['Sensitivity assumptions and arithmetic','Prototype path and overlay behaviour','Invoice example realism','Keyboard flow and focus order','AI-use reflection matches the actual process'],13,30,C.red,600);
});

out.push('</svg>');
const target = new URL('./CloudFactory_Smart_Exception_Hub_Editable.svg', import.meta.url);
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log(target.pathname);
