/**
 * 手元のファイル名から、絵の名前を割り出す（v1.6-c）。
 *
 * 差し替え口の名前は `species-pikachu` のように決まっているが、
 * **手元の素材はそう並んでいない** ―― `001.png`・`pikachu.png`・
 * `025 Pikachu.png` のどれかで来る。228回の名前付けを人にやらせない。
 *
 * ## ここに置いた理由
 *
 * 同じ判定が2か所に要る。
 *
 *   - パソコン … `tools/collect-art.ts`（フォルダごと名前を直してコピー）
 *   - スマホ   … 設定画面（**その場で名前を直して入れる**）
 *
 * スマホには node が無いので道具が使えない ―― かといって判定を2つ書くと、
 * **片方だけ直した跡が残る。** だから判定はここ1つで、呼ぶ側が2つ。
 *
 * ## 迷ったら決めない
 *
 * 1つの鍵が2種に当たるなら、その鍵は**捨てる**。
 * 残しておくと「たまたま先に見つかったほう」が選ばれ、静かに間違った絵が入る。
 */

export type ArtMatch =
  | { kind: "already"; name: string }
  | { kind: "renamed"; name: string }
  | { kind: "ambiguous"; candidates: readonly string[] }
  | { kind: "unknown" };

export type MatchSpecies = { id: string; name: string; dexNo: number };

/** 見出しの揺れを吸う。`Mr. Mime` も `mr-mime` も同じ鍵になる。 */
const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/gu, "");

/** 拡張子を落とす（`store.ts` の `artName` と同じ規則）。 */
export const stemOf = (fileName: string): string => fileName.replace(/\.[^.]+$/u, "");

/**
 * ファイル名 → 種の対応表。**1つの鍵が2種に当たったら、その鍵を捨てる。**
 *
 * 日本語名も鍵にする ―― 手元の素材が「ピカチュウ.png」でも当たるように。
 */
export function buildIndex(species: readonly MatchSpecies[]): ReadonlyMap<string, string> {
  const byKey = new Map<string, string>();
  const dropped = new Set<string>();
  const remember = (key: string, id: string): void => {
    if (key === "" || dropped.has(key)) return;
    const seen = byKey.get(key);
    if (seen !== undefined && seen !== id) {
      byKey.delete(key);
      dropped.add(key);
      return;
    }
    byKey.set(key, id);
  };
  for (const s of species) {
    remember(norm(s.id), s.id);
    // 日本語名は `norm` で消えてしまうので、そのまま鍵にする
    remember(s.name, s.id);
    remember(String(s.dexNo), s.id);
    remember(String(s.dexNo).padStart(3, "0"), s.id);
  }
  return byKey;
}

/**
 * 鍵の候補。`025 Pikachu.png` は「025」でも「pikachu」でも当たる ――
 * **どちらか片方の並びしか想定しない**と、もう片方の持ち主が使えない。
 */
function keysOf(stem: string): readonly string[] {
  const keys = [norm(stem), stem.trim()];
  for (const digits of stem.match(/\d+/gu) ?? []) {
    keys.push(String(Number(digits)));
    keys.push(digits.padStart(3, "0"));
  }
  for (const word of stem.split(/[^A-Za-z]+/u)) if (word !== "") keys.push(norm(word));
  for (const word of stem.split(/[\s_-]+/u)) if (word !== "") keys.push(word.trim());
  return keys;
}

/**
 * 1つのファイル名を見る。
 *
 * **すでに当たっている名前は触らない**（`known` にある）。
 * 触ると、正しく名付けた人の `tile-grass.png` を勝手に読み替えることになる。
 */
export function matchArtName(
  fileName: string,
  index: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
): ArtMatch {
  const stem = stemOf(fileName);
  if (known.has(stem)) return { kind: "already", name: stem };
  // 向きつきの人（`npc-oak-down`）も、そのまま通す
  if (known.has(stem.replace(/-(up|down|left|right)$/u, ""))) return { kind: "already", name: stem };

  const hits = new Set<string>();
  for (const key of keysOf(stem)) {
    const id = index.get(key);
    if (id !== undefined) hits.add(id);
  }
  if (hits.size === 0) return { kind: "unknown" };
  if (hits.size > 1) return { kind: "ambiguous", candidates: [...hits] };
  return { kind: "renamed", name: `species-${[...hits][0]!}` };
}
