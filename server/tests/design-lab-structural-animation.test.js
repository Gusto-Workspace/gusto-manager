const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createAnimatedCaptureController}=require('../services/design-lab/structural-animated-components');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240"><rect width="300" height="240" fill="teal"/></svg>').toString('base64');
test('gel contrôlé : RAF, CSS et Web Animations préservent le cadrage et reprennent après restauration',
  {skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>r.abort());
  try {
    for(const mechanism of ['raf','css','waapi','css-fade']){
      await page.setContent(`<style>body{margin:0}.gallery{margin:100px;width:1000px;height:300px;overflow:hidden;perspective:1500px}.track{display:flex;width:1600px;gap:20px}.track img{width:300px;height:240px;flex:none} @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-500px)}}</style><div class="gallery"><div class="track">${Array(5).fill(`<img src="${image}">`).join('')}</div></div>`);
      await page.evaluate(mechanism=>{
        const track=document.querySelector('.track');window.clock=0;
        const tick=()=>{window.clock++;if(mechanism==='raf')track.style.transform=`translateX(${-window.clock/2}px)`;requestAnimationFrame(tick);};tick();
        if(mechanism==='css')track.style.animation='drift 10s linear infinite';
        if(mechanism==='waapi')track.animate([{transform:'translateX(0)'},{transform:'translateX(-500px)'}],{duration:10000,iterations:Infinity});
        if(mechanism==='css-fade'){
          const style=document.createElement('style');style.textContent='@keyframes fade{from{opacity:.1}to{opacity:.9}}.track{position:relative;width:1000px;height:300px}.track img{position:absolute;left:0;top:0;width:1000px;height:300px;animation:fade 3s linear infinite alternate}';document.head.append(style);
        }
      },mechanism);
      await page.waitForTimeout(250);
      const control=createAnimatedCaptureController(page,Date.now()+10000);
      const frozen=await control.freeze();assert.equal(frozen.length,1,mechanism);
      const expected={raf:'inline_motion_updates',css:'css_animation',waapi:'web_animation','css-fade':'css_animation'}[mechanism];
      assert.ok(frozen[0].detectedMechanisms.includes(expected));
      const target=page.locator(mechanism==='css-fade'?'.track img':'.track').first();
      const snapshot=await target.evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity,clock:window.clock}));
      await page.screenshot({animations:'disabled'});
      await page.waitForTimeout(350);
      assert.equal((await control.verify()).valid,true);
      const after=await target.evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity,clock:window.clock}));
      assert.deepEqual(after.rect,snapshot.rect);assert.equal(after.transform,snapshot.transform);
      assert.equal(after.opacity,snapshot.opacity);
      assert.ok(after.clock>snapshot.clock,'unrelated timers keep running');
      await control.restore();
      assert.equal(await page.locator('[data-gusto-animated-frame],[data-gusto-animated-style]').count(),0);
      await page.waitForTimeout(250);
      assert.notEqual(await target.evaluate((n,fade)=>getComputedStyle(n)[fade?'opacity':'transform'],mechanism==='css-fade'),mechanism==='css-fade'?snapshot.opacity:snapshot.transform);
    }
  } finally {await browser.close();}
});
test('gel refusé si l’enveloppe évolue ; une mutation du layout invalide le gel et reste restaurable',
  {skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>r.abort());
  try {
    await page.setContent(`<style>.gallery{width:1000px;height:300px;overflow:hidden}.track{display:flex;width:1600px}.track img{width:300px;height:240px;flex:none}</style><div class="gallery"><div class="track">${Array(5).fill(`<img src="${image}">`).join('')}</div></div>`);
    await page.evaluate(()=>{let t=0;window.changeEnvelope=true;const tick=()=>{t++;document.querySelector('.track').style.transform=`translateX(${-t}px)`;if(window.changeEnvelope)document.querySelector('.gallery').style.width=`${1000+t}px`;requestAnimationFrame(tick);};tick();});
    const control=createAnimatedCaptureController(page,Date.now()+10000);
    assert.deepEqual(await control.freeze(),[]);
    assert.equal(await page.locator('[data-gusto-animated-frame]').count(),0);
    await page.evaluate(()=>window.changeEnvelope=false);
    assert.equal((await control.freeze()).length,1);
    try {
      await page.locator('img').first().evaluate(n=>n.style.height='280px');
      assert.equal((await control.verify()).valid,false);
      throw Error('capture failure');
    } catch(e){assert.equal(e.message,'capture failure');}
    finally {await control.restore();}
    assert.equal(await page.locator('[data-gusto-animated-frame],[data-gusto-animated-style]').count(),0);
    assert.equal(await page.locator('img').first().evaluate(n=>n.style.height),'280px','external mutations are retained');
  } finally {await browser.close();}
});
