const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createProductDiagnostics}=require("../services/design-lab/structural-product-diagnostics");
test("archive produit passive : activation locale explicite, checkpoints conservés sans modifier les entrées",()=>{
  const output=path.resolve(__dirname,"../diagnostics",`product-diagnostics-test-${process.pid}`);
  const argv=[`--structural-product-diagnostics-output=${output}`],id="507f1f77bcf86cd799439011",generation="fixture-generation";
  assert.equal(createProductDiagnostics({argv:[],env:{NODE_ENV:"production"}}),null);
  assert.throws(()=>createProductDiagnostics({argv,env:{NODE_ENV:"production"}}));
  assert.throws(()=>createProductDiagnostics({argv:["--structural-product-diagnostics-output=/tmp"],env:{NODE_ENV:"development"}}));
  try{
    const archive=createProductDiagnostics({argv,env:{NODE_ENV:"development"}});
    const event={status:"prepared_for_vision",capturePerformance:{elapsedMs:95000},captureDiagnostics:{registry:{status:"reliable"},finalRecaptures:1},
      captureCoverage:{totalHeight:11430,complete:true,observationSelection:{mode:"adaptive"}},visionInput:{viewOrder:["overview","observation1","observation2"]}};
    const before=JSON.stringify(event);archive(id,generation,event);archive(id,generation,{status:"applied",analysis:{overview:"fixture"}});
    assert.equal(JSON.stringify(event),before);
    const stored=JSON.parse(fs.readFileSync(path.join(output,id,generation,"product-run.json")));
    assert.equal(stored.status,"applied");assert.equal(stored.capturePerformance.elapsedMs,95000);assert.equal(stored.captureDiagnostics.registry.status,"reliable");
    assert.deepEqual(stored.visionInput,event.visionInput);assert.equal(stored.analysis.overview,"fixture");
    assert.equal(fs.existsSync(path.join(output,id,generation,"product-run.json.tmp")),false);
  }finally{fs.rmSync(output,{recursive:true,force:true});}
});
test("erreur d'archive locale : diagnostic signalé sans faire échouer le pipeline",()=>{
  const warnings=[],archive=createProductDiagnostics({argv:[`--structural-product-diagnostics-output=${path.resolve(__dirname,"../diagnostics/product-diagnostics-test")}`],
    env:{NODE_ENV:"development"},logger:{warn:(...args)=>warnings.push(args)}});
  assert.doesNotThrow(()=>archive("../../invalid","generation",{status:"running"}));assert.equal(warnings.length,1);
});
