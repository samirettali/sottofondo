import { createSongPlan, freeze, type Cell, type ElectronicGenre, type SongPlan } from "./plan.ts";

/** Original 32-bar studies. These phrases are authored, not generated or copied from tracks.
 * They share the production catalog and renderer with procedural compositions.
 */
const PHRASES = [
  [[0,0,2],[3,0,1],[6,7,2],[10,4,1],[12,6,3],[16,0,2],[19,2,1],[22,7,2],[27,4,1],[30,0,2]],
  [[0,0,1],[2,1,1],[5,7,1],[7,0,2],[11,3,1],[14,1,1],[16,0,1],[18,7,1],[21,6,2],[25,3,1],[28,1,1],[31,0,1]],
  [[0,0,2],[6,4,1],[11,2,1],[17,0,2],[22,4,1],[29,6,1]],
  [[1,0,1],[4,7,1],[9,1,1],[14,4,1],[17,0,1],[21,6,1],[26,1,1],[30,4,1]],
  [[0,4,3],[5,6,2],[8,7,3],[14,4,2],[18,2,3],[23,1,2],[26,0,4]],
  [[2,0,1],[5,2,2],[10,4,2],[14,7,1],[18,6,2],[21,4,2],[26,2,1],[29,0,2]],
] as const;
export const STUDIES = [
  { id: "acid-liquid", genre: "acid", seed: 31, title: "Liquid Conversation", bass: "acid-liquid", lead: "bubble", support: "halo", kit: "round" },
  { id: "acid-raw", genre: "acid", seed: 47, title: "Copper Teeth", bass: "acid-rough", lead: "wire", support: "air", kit: "hard" },
  { id: "techno-deep", genre: "techno", seed: 83, title: "Submerged Rooms", bass: "sub", lead: "reed", support: "dub", kit: "round" },
  { id: "techno-metal", genre: "techno", seed: 109, title: "Seven Pins", bass: "hollow", lead: "metal", support: "bell-sample", kit: "hard" },
  { id: "house-electric", genre: "house", seed: 151, title: "Evening Windows", bass: "wood", lead: "spark", support: "epiano", kit: "dry" },
  { id: "house-organ", genre: "house", seed: 179, title: "Side Street", bass: "rubber", lead: "reed", support: "organ", kit: "round" },
] as const;
export function studyPlan(id: string): SongPlan {
  const index = STUDIES.findIndex(s => s.id === id);
  const study = STUDIES[index];
  if (!study) throw new Error(`Unknown study: ${id}`);
  const p = createSongPlan(study.genre as ElectronicGenre, study.seed, 1);
  const a: Cell[] = PHRASES[index]!.map(([step, degree, length], i) => ({ step, degree, length,
    velocity: i % 3 ? .68 : .9, accent: i % 3 === 0, slide: i % 4 === 1 }));
  return freeze({ ...p, study: true, title: study.title, kit: study.kit, motifBars: 2, phraseBars: 8,
    motifs: [a, a.map(c => ({ ...c, degree: c.degree === 0 ? 0 : c.degree - 1 }))],
    roles: p.roles.map(r => ({ ...r, patch: r.id === "bass" ? study.bass : r.id === "lead" ? study.lead : r.id === "support" ? study.support : r.patch })) });
}
