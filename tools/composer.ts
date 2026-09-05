import { currentRecipe, recipe, recipeParams } from "../src/recipe.ts";
import { parseSeed } from "../src/core/rng.ts";
import { createSongPlan, planChapter, type ElectronicGenre } from "../src/composer/plan.ts";
import { STUDIES } from "../src/composer/studies.ts";

const select = (id: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
const studySelect = select("study") as HTMLSelectElement;
for (const study of STUDIES) studySelect.add(new Option(study.title,study.id));
const urls: string[] = [];
const status = document.querySelector("#status")!;
const clips = document.querySelector("#clips")!;
const button = document.querySelector<HTMLButtonElement>("#render")!;
document.querySelector("#reveal")!.addEventListener("click",()=>{
  document.querySelectorAll<HTMLElement>("[data-version]").forEach(el=>{el.textContent+=` — ${el.dataset.version}`;delete el.dataset.version;});
});
button.addEventListener("click",()=>{
  void (async()=>{
    button.disabled=true; urls.splice(0).forEach(URL.revokeObjectURL); clips.textContent="";
    const study=STUDIES.find(s=>s.id===studySelect.value);
    const genre=study?.genre??select("genre").value as ElectronicGenre;
    const seed=study?.seed??parseSeed(select("seed").value);
    const form=planChapter(createSongPlan(genre,seed),0);
    const section=select("section").value;
    const begin=study?0:section==="opening"?0:section==="development"?form.find(s=>s.name==="develop")!.start:form.find(s=>s.name==="contrast")!.start-4;
    const versions=study?["study"]:seed%2?["strudel-2","strudel-1"]:["strudel-1","strudel-2"];
    for(const [i,version] of versions.entries()) {
      status.textContent=`Rendering ${i+1}/${versions.length}…`;
      const params=recipeParams(version==="strudel-1"?recipe(genre,seed):currentRecipe(genre,seed));
      params.set("begin",String(begin));params.set("end",String(study?32:begin+8));
      if(study) params.set("study",study.id);
      const frame=document.createElement("iframe");
      const result=await new Promise<{bytes:ArrayBuffer;peak:number;rms:number}>((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);window.removeEventListener("message",receive);frame.remove();};
        const receive=(e:MessageEvent)=>{
          if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
          if(e.data.type==="rendered"){cleanup();resolve(e.data);}
          if(e.data.type==="render-error"){cleanup();reject(new Error(e.data.message));}
        };
        const timer=setTimeout(()=>{cleanup();reject(new Error("Render timed out"));},600000);
        window.addEventListener("message",receive);frame.src=`/tools/render-one.html?${params}`;document.body.append(frame);
      });
      if(!(result.peak>0&&result.peak<=1&&Number.isFinite(result.rms)))throw new Error("Silent or invalid render");
      const url=URL.createObjectURL(new Blob([result.bytes],{type:"audio/wav"}));urls.push(url);
      const article=document.createElement("article");const title=document.createElement("h2");
      title.textContent=study?.title??String.fromCharCode(65+i);title.dataset.version=version;
      const audio=document.createElement("audio");audio.controls=true;audio.src=url;
      const link=document.createElement("a");link.href=url;link.download=`${genre}-${seed}-${version}.wav`;link.textContent="Download WAV";
      article.dataset.peak=String(result.peak);article.dataset.rms=String(result.rms);
      article.append(title,audio,link);clips.append(article);
    }
    status.textContent="Ready. Listen before revealing the versions.";
  })().catch(error=>{status.textContent=String(error);}).finally(()=>{button.disabled=false;});
});
