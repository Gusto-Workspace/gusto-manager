// Local test boundaries only. The real router, normal service.run and browser
// pipeline execute; persistence and the paid analyzer are replaced in memory.
const express = require('express');
const { createStructuralService } = require('../../services/design-lab/structural-reference.service');
const { createRouter } = require('../../routes/admin/design-lab-structural.routes');
const clone = value => structuredClone(value);
const {isDeepStrictEqual}=require('node:util');
function matchesDocument(r,filter) {
  const get=key=>key.split('.').reduce((v,k)=>v?.[k],r);
  return Object.entries(filter).every(([key,value])=>{
    if(key==='$or')return value.some(branch=>matchesDocument(r,branch));
    if(key==='$and')return value.every(branch=>matchesDocument(r,branch));
    const actual=get(key);
    if(value&&typeof value==='object'&&!(value instanceof Date)) {
      if('$in'in value)return value.$in.some(v=>v===null?actual==null:isDeepStrictEqual(actual,v));
      if('$nin'in value)return !value.$nin.some(v=>isDeepStrictEqual(actual,v));
      if('$lt'in value)return actual!=null&&+new Date(actual)<+new Date(value.$lt);
      if('$exists'in value)return (actual!==undefined)===value.$exists;
      return isDeepStrictEqual(actual,value);
    }
    return value==null?actual==null:value instanceof Date?actual!=null&&+new Date(actual)===+value:String(actual)===String(value);
  });
}
function query(value) {
  return { select() { return this; }, sort() { return this; }, lean: async () => clone(value) };
}
function memoryModel(seed = []) {
  const records = new Map(seed.map(r => [String(r._id), clone(r)]));
  const matches=matchesDocument;
  return { records,
    find: filter => query([...records.values()].filter(r => matches(r, filter))),
    findById: id => query(records.get(String(id)) || null),
    findOne: filter => query([...records.values()].find(r => matches(r, filter)) || null),
    findOneAndUpdate(filter, update, options) {
      const row = [...records.values()].find(r => matches(r, filter));
      if (!row) return query(null);
      const before = clone(row); Object.assign(row, clone(update.$set));
      return query(options?.new ? row : before);
    },
    async create(row) {
      const value = { _id: (BigInt('0x507f1f77bcf86cd799439012')+BigInt(records.size)).toString(16), ...clone(row) };
      records.set(String(value._id), value); return clone(value);
    },
  };
}
async function runProductPath({ sourceUrl, capture, observeUpload = () => {} }) {
  const id = '507f1f77bcf86cd799439011';
  const Model = memoryModel([{ _id: id, sourceType: 'manual_url', sourceUrl,
    status: 'new', captures: [], analysis: { previous: 'preserved' }, operationToken: '' }]);
  const AttemptModel = memoryModel(), events = [], uploads = [];
  let boundary, analyzerBoundaryCalls = 0;
  const service = createStructuralService({ Model, AttemptModel,
    ...(capture ? { capture } : {}),
    productDiagnostics: (_id, generationId, event) => events.push({ generationId, ...clone(event) }),
    logger: { warn() {} },
    upload: async buffer => {
      const image = { publicId: `memory-${uploads.length}`, url: `data:image/webp;base64,${buffer.toString('base64')}` };
      uploads.push(buffer); await observeUpload(buffer, uploads.length - 1); return image;
    },
    destroy: async () => {},
    analyze: async (captures, metadata, options) => {
      analyzerBoundaryCalls++; boundary = { captures, metadata, manifest: options.visionInput };
      // Stop exactly at the analyzer dependency boundary, before any paid code.
      throw Object.assign(new Error('Local diagnostic: stopped before Vision.'), { status: 422, code: 'LOCAL_VISION_BOUNDARY' });
    },
  });
  const app = express(); app.use(express.json());
  app.use('/api', createRouter({ Model, service, auth: (_q, _s, next) => next(), role: (_q, _s, next) => next() }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const started = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/design-lab/structural-references/${id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { statusCode: response.status, response: await response.json(), elapsedMs: performance.now() - started,
      events, boundary, uploads, analyzerBoundaryCalls, attempts: [...AttemptModel.records.values()] };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
module.exports = { runProductPath, memoryModel,matchesDocument };
