/**
 * veekun CSV の読み口（v1.1-j）。
 *
 * v0.9.5 から取り込み器を4本（`fetch-numbers` / `fetch-art` / `fetch-machines` /
 * `fetch-encounters`）書いてきて、**CSV の読み方が4回書かれていた。**
 * v1.1-a で `neighborsOf` を `core` に一本化したのと同じ理由でここに寄せる ――
 * 同じことを何箇所にも書くと、直すときに**直し損ねた1箇所**が残る。
 *
 * ここが持つのは「公式データをどう読むか」だけで、**何に使うかは持たない。**
 */

import { readFileSync } from "node:fs";

export const CSV = "node_modules/pokedex/data/csv";

/**
 * CSV を1行1オブジェクトにする。引用符つきの欄（`"Sinnoh, Route 1"` のような）に対応する。
 *
 * 列数の合わない行は落とす。**今のデータには1行も無い**（15ファイルで実測0件）が、
 * 落とさずに通すと「欄がずれたまま黙って入る」ほうへ倒れる。
 */
export function parseCsv(file: string): Record<string, string>[] {
  const text = readFileSync(`${CSV}/${file}`, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const head = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * 日本語名。**`local_language_id = 1` は `ja-Hrkt`**（かな表記）で、
 * 本作が使っている表記そのもの ―― `2` の roomaji でも `11` の漢字まじりでもない。
 */
const JAPANESE = "1";

/** `identifier → 日本語名` の表を作る。名前の表は id で引くので、id の表と2枚を突き合わせる。 */
function namesById(
  idFile: string,
  nameFile: string,
  foreignKey: string,
): ReadonlyMap<string, string> {
  const identifier = new Map(parseCsv(idFile).map((r) => [r["id"]!, r["identifier"]!]));
  const out = new Map<string, string>();
  for (const row of parseCsv(nameFile)) {
    if (row["local_language_id"] !== JAPANESE) continue;
    const id = identifier.get(row[foreignKey]!);
    if (id !== undefined) out.set(id, row["name"]!);
  }
  return out;
}

/**
 * 種族の日本語名。
 *
 * **ここが「アブラ事件」の直し方**（v1.1-i）。`abra` の日本語名を ケーシィ ではなく
 * アブラ と書いたのは、この列だけ**突き合わせる相手が居なかった**から。
 * 公式データは 807種ぶんの かな表記を持っていて、
 * **今ある190種と1件も食い違わない**（実測）―― 手で書く必要がそもそも無かった。
 */
export const speciesNamesJa = (): ReadonlyMap<string, string> =>
  namesById("pokemon_species.csv", "pokemon_species_names.csv", "pokemon_species_id");

/** 特性の日本語名。同上（68件で不一致0）。 */
export const abilityNamesJa = (): ReadonlyMap<string, string> =>
  namesById("abilities.csv", "ability_names.csv", "ability_id");

/**
 * 技の日本語名は**ここに置かない。**
 *
 * 250件と突き合わせたら10件ずれた ―― `１０まんボルト`（全角）・`スプーンまげ`（旧名）など、
 * veekun の側が古い。**種族名と特性名は置き換えられて、技名は置き換えられない**というのが
 * 実測の結論なので、`source/moves.tsv` は手書きのままにする。
 * 「入れていないこと」と「入れ忘れ」を区別するために、ここに理由を残す。
 */
