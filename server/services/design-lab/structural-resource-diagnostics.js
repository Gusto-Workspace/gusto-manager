// Passive evidence only. Never read by resource budgets or quality decisions.
function createResourceDiagnostics(page, { now = Date.now, maximum = 2048 } = {}) {
  const records = [], identities = new WeakMap();
  const navigations=[];
  let truncated = false;
  const identify = request => {
    if (identities.has(request)) return identities.get(request);
    if (records.length >= maximum) { truncated = true; return null; }
    const row = { id: records.length + 1, url: request.url(), type: request.resourceType?.(),
      method: request.method?.(), startedAtMs: now(), browserState: 'pending', transportState: 'not_started' };
    try {
      const frame=request.frame?.();
      if(frame)row.frame={url:frame.url(),main:frame===page.mainFrame?.(),parentUrl:frame.parentFrame()?.url()||null};
    } catch {} // Workers/detached frames do not provide an owner certificate.
    records.push(row); identities.set(request, row); return row;
  };
  const errorFields = error => ({ name: error.name, code: error.code || null,
    message: String(error.message || '').slice(0, 500), status: error.networkStatus || null,
    ...(error.cause ? {cause:{name:error.cause.name,code:error.cause.code||null}} : {}),
    ...(error.transportProof ? {transportProof:{...error.transportProof}} : {}),
    ...(error.redirectsObserved!==undefined ? {redirectsObserved:error.redirectsObserved} : {}) });
  page.on('request', identify);
  page.on('response', response => {
    const row = identify(response.request());
    if (row) { row.status = response.status(); row.responseAtMs = now(); }
  });
  page.on('requestfinished', request => {
    const row = identify(request); if (row) { row.browserState = 'completed'; row.finishedAtMs = now(); }
  });
  page.on('requestfailed', request => {
    const row = identify(request); if (!row) return;
    row.browserError = request.failure?.()?.errorText || 'unknown';
    row.browserState = /ABORT/i.test(row.browserError) ? 'aborted' : 'error'; row.finishedAtMs = now();
  });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    for (const row of records) if (text.includes(row.url)) {
      row.consoleError = text.slice(0, 1000); row.corsError = /CORS|cross-origin/i.test(text);
    }
  });
  page.on('framenavigated',frame=>{if(frame===page.mainFrame?.())navigations.push({url:frame.url(),atMs:now()});});
  const snapshot = url => records.filter(row => row.url.split('#')[0] === url.split('#')[0]).map(row => ({ ...row,
    elapsedMs: (row.finishedAtMs || now()) - row.startedAtMs }));
  return {
    begin(request, headers) {
      const row = identify(request); if (row) {
        row.routeStartedAtMs = now(); row.range = headers.range || null;
        row.origin = headers.origin || null; row.acceptLanguage = headers['accept-language'] || null;
      }
    },
    transportStarted(request, url) {
      const row = identify(request); if (row) {
        row.transportAttempts||=[];row.transportAttempts.push({url,startedAtMs:now()});
        row.transportState = 'pending'; row.transportUrl = url; row.transportStartedAtMs = now(); }
    },
    transportCompleted(request, response) {
      const row = identify(request); if (row) { row.transportState = 'completed'; row.transportStatus = response.status;
        delete row.transportError; // Earlier failures remain in transportAttempts.
        row.transportFinishedAtMs = now(); row.bytes = response.body?.length; row.finalUrl = response.url;
        Object.assign(row.transportAttempts?.at(-1)||{},{finishedAtMs:now(),status:response.status,bytes:response.body?.length});
        row.contentRange = response.headers?.['content-range'] || null; }
    },
    transportFailed(request, error) {
      const row = identify(request); if (row) { row.transportState = 'error'; row.transportError = errorFields(error); row.transportFinishedAtMs = now();
        Object.assign(row.transportAttempts?.at(-1)||{},{finishedAtMs:now(),error:errorFields(error)}); }
    },
    fulfilled(request, response, cacheHit) {
      const row = identify(request); if (row) { row.routeState = 'fulfilled'; row.routeFinishedAtMs = now();
        row.status = response.status; row.resourceCacheHit = cacheHit;
        if (cacheHit) row.transportState = 'resource_cache'; }
    },
    failed(request, error) {
      const row = identify(request); if (row) { row.routeState = 'error'; row.routeError = errorFields(error); row.routeFinishedAtMs = now(); }
    },
    aborted(request,reason) {
      const row=identify(request);if(row){row.routeState='aborted';row.abortReason=reason;row.routeFinishedAtMs=now();}
    },
    snapshot, snapshotAll: () => ({ truncated, navigations:[...navigations],requests: records.map(row => ({ ...row })) }),
  };
}
function inspectResourceFrameOwnerDOM(owner){
  const r=owner.getBoundingClientRect(),s=getComputedStyle(owner);
  return {tag:owner.localName,label:owner.getAttribute('aria-label')||owner.getAttribute('title'),
    geometry:{x:r.x,y:r.y,width:r.width,height:r.height},position:s.position,
    display:s.display,visibility:s.visibility,opacity:s.opacity};
}
async function inspectResourceFrameOwner(frame){
  let owner;
  try{owner=await frame.frameElement();return await owner.evaluate(inspectResourceFrameOwnerDOM);}
  catch(error){return {unavailable:true,error:error.message};}
  finally{await owner?.dispose();}
}
module.exports = { createResourceDiagnostics,inspectResourceFrameOwnerDOM,inspectResourceFrameOwner };
