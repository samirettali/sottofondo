import { initAudio, registerSynthSounds, setAudioContext, setSuperdoughAudioController, superdough } from "superdough";
import { StereoOutput } from "../src/strudel/output.ts";

async function probe(): Promise<void> {
  const params=new URLSearchParams(location.search);
  const ctx=new OfflineAudioContext(2,48000,48000);
  const output=new StereoOutput(ctx,ctx.destination);
  setAudioContext(ctx);setSuperdoughAudioController(output);
  await initAudio();registerSynthSounds();
  const variant=params.get("variant");
  await superdough({s:variant?.startsWith("filter")?"sawtooth":"sine",note:57,gain:.1,
    attack:.005,decay:variant==="short"?.04:variant==="long"?.6:.3,
    sustain:variant==="short"||variant==="long"?0:.5,release:.05,
    fmi:variant==="fm"?2:0,fmh:2,fmdecay:1,fmsustain:1,
    cutoff:variant==="filter-low"||variant==="filter-envelope"?500:variant==="filter-high"?8000:20000,
    lpenv:variant==="filter-envelope"?3:0,lpdecay:.3,
  },.02,.8,.5,0);
  const buffer=await ctx.startRendering();const data=buffer.getChannelData(0);
  const rms=(start:number,end:number)=>Math.sqrt(data.slice(start*48000,end*48000).reduce((s,v)=>s+v*v,0)/((end-start)*48000));
  let energy=0,difference=0;
  for(let i=4800;i<14400;i++){energy+=data[i]!**2;difference+=(data[i]!-data[i-1]!)**2;}
  Object.assign(window,{probeResult:{early:rms(.1,.2),late:rms(.5,.7),roughness:difference/energy}});
  output.dispose();
}
void probe().catch(error=>Object.assign(window,{probeError:String(error)}));
