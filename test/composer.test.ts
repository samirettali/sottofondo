import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createSongPlan, planChapter, type ElectronicGenre } from "../src/composer/plan.ts";
import { composeSongBar, songPattern } from "../src/composer/compose.ts";
import { PATCHES } from "../src/composer/catalog.ts";
import { STUDIES, studyPlan } from "../src/composer/studies.ts";
import { compositionPattern } from "../src/strudel/compose.ts";
import { currentRecipe, recipe, readRecipe, recipeParams } from "../src/recipe.ts";

const genres: ElectronicGenre[] = ["acid", "techno", "house"];
const events = (pattern: ReturnType<typeof songPattern>, begin: number, end: number) =>
  pattern.queryArc(begin,end).map(h => [+h.whole.begin,+h.whole.end,h.value]);
for (const genre of genres) {
  test(`${genre}: immutable identity, random access and lane isolation`, () => {
    const p = createSongPlan(genre,729);
    assert.deepEqual(p,createSongPlan(genre,729));
    assert.ok(Object.isFrozen(p.roles[0]));
    const pattern = songPattern(p);
    const distant = events(pattern,600,608);
    for(let bar=0;bar<608;bar++) pattern.queryArc(bar,bar+1);
    assert.deepEqual(events(pattern,600,608),distant);
    const muted = songPattern(p,()=>({ bass:{muted:true,density:0} }));
    assert.deepEqual(events(muted,600,608),distant.filter(e=>(e[2] as any).laneId!=="bass"));
    for (let chapter=0;chapter<20;chapter++) {
      const sections=planChapter(p,chapter);
      assert.equal(sections.reduce((n,s)=>n+s.bars,0),128);
      assert.equal(sections[0]!.start,chapter*128);
    }
    for(let bar=0;bar<256;bar++) for(const e of composeSongBar(p,bar)) {
      assert.ok(e.end>e.begin);
      assert.ok(e.velocity>0 && e.velocity<=1);
      assert.ok((e.notes??[e.midi??60]).every(n=>Number.isInteger(n)&&n>=0&&n<=127));
    }
  });
  test(`${genre}: 1,000 seeds differ in at least three musical dimensions`, () => {
    const fingerprints=Array.from({length:1000},(_,seed)=>{
      const p=createSongPlan(genre,seed);
      return [JSON.stringify([p.family,p.kit,p.roles.map(r=>r.patch)]),String(p.groove),
        JSON.stringify(p.roles.map(r=>r.id)),
        JSON.stringify(p.motifs.map(m=>m.map(c=>[c.step,c.degree-m[0]!.degree,c.length]))),
        JSON.stringify(planChapter(p,0).map(s=>[s.name,s.bars,s.transform]))];
    });
    let diverse=0;
    for(let i=1;i<fingerprints.length;i++) if(fingerprints[i]!.filter((v,j)=>v!==fingerprints[i-1]![j]).length>=3) diverse++;
    assert.ok(diverse/999>=.9,`${diverse}/999 adjacent seed pairs`);
    console.log(`${genre}: ${diverse}/999 pairs differ on >=3/5 dimensions (excluding seed, BPM and key)`);
  });
  test(`${genre}: fragmented queries and swing preserve every onset`, () => {
    const p=createSongPlan(genre,31);
    const pattern=songPattern(p,()=>({}),()=>.61);
    const onsets=(haps:ReturnType<typeof pattern.queryArc>)=>haps.filter(h=>h.hasOnset()).map(h=>[+h.whole.begin,+h.whole.end,h.value]);
    const split=Array.from({length:512},(_,i)=>pattern.queryArc(i/64,(i+1)/64)).flat();
    assert.deepEqual(onsets(split),onsets(pattern.queryArc(0,8)));
    const bass=pattern.queryArc(0,8).filter(h=>h.hasOnset()&&h.value.kind==="bass");
    for(let i=0;i<bass.length-1;i++)if(bass[i]!.value.slide)assert.equal(+bass[i]!.whole.end,+bass[i+1]!.whole.begin);
  });
}
test("v1 event snapshots remain frozen",()=>{
  const hashes=["92c06ea66f01824719208edbfe8d0edb11e3e0c5654f02907b500fd9bfc1a922","87fc6840beea229af151cfc34361ab662406bca4f698d20862836cc6c5769ca8","11df4a2628c5b464a3ca09eec187a33eba845ca8226d3b0247e3c6e80c1f1c03"];
  genres.forEach((g,i)=>{
    const data=[1,17,729].flatMap(seed=>[0,16,129,600].map(bar=>compositionPattern(recipe(g,seed)).queryArc(bar,bar+1).map(h=>[+h.whole.begin,+h.whole.end,h.value])));
    assert.equal(createHash("sha256").update(JSON.stringify(data)).digest("hex"),hashes[i]);
  });
});
test("v2 recipes round trip and reject incompatible palette modes",()=>{
  for(const g of genres) assert.deepEqual(readRecipe(recipeParams(currentRecipe(g,729))),currentRecipe(g,729));
  assert.throws(()=>readRecipe(new URLSearchParams("g=acid&e=strudel-2&m=synth")));
});
test("catalog assets have immutable provenance and fit the loading budget",()=>{
  assert.ok(PATCHES.filter(p=>!p.asset).length>=24);
  let bytes=0;
  for(const file of readdirSync(new URL("../public/samples/v2/",import.meta.url))) {
    const raw=readFileSync(new URL(`../public/samples/v2/${file}`,import.meta.url)); bytes+=raw.length;
    const entry=JSON.parse(raw.toString());
    assert.equal(entry.license,"CC0-1.0");
    assert.match(entry.source,/25baaed3c28003bf141f591081217136194b0d69/);
    assert.equal(createHash("sha256").update(Buffer.from(entry.data.split(",")[1],"base64")).digest("hex"),entry.sha256);
  }
  assert.ok(bytes<20_000_000);
  for(const s of STUDIES) assert.equal(studyPlan(s.id).motifBars,2);
});
test("composer decisions use neither clocks nor transcendental functions",()=>{
  for(const name of ["plan","compose","studies"]){
    const source=readFileSync(new URL(`../src/composer/${name}.ts`,import.meta.url),"utf8");
    assert.doesNotMatch(source,/Math\.(sin|cos|tan|pow|exp|log|random)\s*\(|Date\.now|performance\.now|currentTime/);
  }
});
