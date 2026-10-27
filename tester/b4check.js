const {chromium}=require('/opt/npm-tools/node_modules/playwright');const fs=require('fs');
const page=fs.readFileSync('run.html','utf8'),shim=fs.readFileSync('react-shim.js','utf8'),app=fs.readFileSync('app.js','utf8');
let pass=0,fail=0;const ok=(c,l,x)=>{c?pass++:fail++;console.log((c?'OK   ':'FEL  ')+l+(x!==undefined?'  ->  '+x:''));};
(async()=>{const b=await chromium.launch();const shots=[];
for(const w of [320,390]){
 const c=await b.newContext({viewport:{width:w,height:800}});
 await c.route('**/*',r=>{const u=r.request().url();if(u==='https://lias.test/')return r.fulfill({contentType:'text/html; charset=utf-8',body:page});if(u.endsWith('/react-shim.js'))return r.fulfill({contentType:'application/javascript',body:shim});if (u.includes('/bilder/')) return r.fulfill({ path: '/mnt/user-data/outputs/github/bilder/' + decodeURIComponent(u.split('/bilder/')[1]) }); if(u.endsWith('/app.js'))return r.fulfill({contentType:'application/javascript',body:app});return r.abort();});
 const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('https://lias.test/');await p.waitForTimeout(800);
 const acc=await p.$('text=Jag förstår och accepterar');if(acc){await p.evaluate(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).overflowY==='auto');d.scrollTop=99999;d.dispatchEvent(new Event('scroll'));});await p.waitForTimeout(150);await acc.click();await p.waitForTimeout(200);}
 for(const [tab,sel] of [['Boka','[data-banner=boka] img'],['Kontakt','[data-banner=kontakt] img'],['Galleri','[data-banner=galleri] img'],['Galleri','[data-gallery=herrklipp] img'],['Galleri','[data-gallery=barnklipp] img'],['Galleri','[data-gallery=styling] img']]){
  await p.click(`nav >> text=${tab}`);await p.waitForTimeout(500);
  const r=await p.$eval(sel,i=>{const b=i.getBoundingClientRect();return {nw:i.naturalWidth,w:Math.round(b.width),h:Math.round(b.height),fit:getComputedStyle(i).objectFit}}).catch(e=>null);
  const sx=await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  ok(r&&r.nw>0&&sx, `${w}px ${tab} ${sel}`, JSON.stringify(r));
  if(sel.includes('banner')&&r) ok(Math.abs(r.w/r.h-1.5)<0.02,`${w}px ${tab}: bilden visas hel (3:2, ingen text beskärs)`,(r.w/r.h).toFixed(3));
  if(w===390&&sel.includes('banner')){const f=`/tmp/t/b4-${tab}.png`;await p.screenshot({path:f});shots.push(f);}
 }
 const step=await p.evaluate(()=>1);
 ok(errs.length===0,`${w}px inga JS-fel`,errs.join('|'));
 // Bannern bara i steg 1 av bokningen
 if(w===390){await p.click('nav >> text=Boka');await p.waitForTimeout(300);await p.click('[data-cat="Herr"]');await p.click('text=Herr kort hår');await p.click('text=Fortsätt');await p.waitForTimeout(300);
  ok(!(await p.$('[data-banner=boka]')),'Bokningsbilden syns bara i steg 1');}
 await c.close();}
console.log(`\nRESULTAT: ${pass} OK, ${fail} FEL`);fs.writeFileSync('/tmp/t/b4shots.json',JSON.stringify(shots));await b.close();})();
