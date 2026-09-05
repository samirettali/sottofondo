import { chromium } from "@playwright/test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// These are generated artifacts, not source edits. One neutrally named clip per directory.
const output=resolve(process.env.RENDER_DIR??"test-results/composer");
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{})});
const page=await browser.newPage({acceptDownloads:true});
const manifest=process.env.RENDER_RESUME==="1"?JSON.parse(await readFile(resolve(output,"manifest.json"),"utf8").catch(()=>"[]")):[];
try {
  await page.goto(`${process.env.RENDER_URL??"http://127.0.0.1:5196"}/tools/composer.html`);
  const render=async(directory)=>{
    const existing=manifest.filter(entry=>entry.file.startsWith(`${directory}/`));
    const expected=directory.startsWith("studies/")?1:2;
    if(existing.length===expected&&(await Promise.all(existing.map(async entry=>(await stat(resolve(output,entry.file)).catch(()=>null))?.size>44))).every(Boolean)){
      console.log(`${directory}: existing clips`);return;
    }
    await page.getByRole("button",{name:"Render comparison"}).click();
    await page.waitForFunction(()=>!document.querySelector("#render").disabled,undefined,{timeout:1200000});
    const status=await page.locator("#status").textContent();if(!status.startsWith("Ready."))throw new Error(status);
    for(let i=0;i<await page.locator("audio").count();i++){
      const file=`${directory}/${String.fromCharCode(65+i)}/clip.wav`;
      await mkdir(resolve(output,directory,String.fromCharCode(65+i)),{recursive:true});
      const pending=page.waitForEvent("download");await page.getByRole("link",{name:"Download WAV"}).nth(i).click();
      const download=await pending;await download.saveAs(resolve(output,file));
      const metrics=await page.locator("article").nth(i).evaluate(el=>({peak:Number(el.dataset.peak),rms:Number(el.dataset.rms)}));
      manifest.push({file,version:download.suggestedFilename(),...metrics});
    }
    console.log(directory);
    await writeFile(resolve(output,"manifest.json"),JSON.stringify(manifest,null,2));
  };
  for(const genre of ["acid","techno","house"])for(let seed=1;seed<=Number(process.env.RENDER_SEEDS??12);seed++)for(const section of ["opening","development","transition"]){
    await page.locator("#genre").selectOption(genre);await page.locator("#seed").fill(seed.toString(16));
    await page.locator("#section").selectOption(section);await render(`${genre}/${seed}/${section}`);
  }
  for(const id of await page.locator("#study option").evaluateAll(options=>options.map(o=>o.value).filter(Boolean))){
    await page.locator("#study").selectOption(id);await render(`studies/${id}`);
  }
  console.log(`Rendered ${manifest.length} clips to ${output}`);
} finally {await browser.close();}
