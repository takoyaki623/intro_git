/**
 * 手元の素材を置いておく場所（v0.10.5）。
 *
 * `source.ts` が「絵の出どころ」を差し替えられるようにしてあるので、
 * ここは**その `local` 側に中身を渡すだけ**。
 *
 * ## なぜ利用者の端末に置くのか
 *
 * 公式素材はこのリポジトリに入れられない（公開リポジトリ・game-plan.md §10）。
 * 遊べる版（Artifact）に同梱するのも同じ理由でできない ―― 配った時点で公衆送信になる。
 *
 * 残るのは1つ。**利用者が自分の端末の画像を、自分のブラウザに入れる。**
 * 画像はどこにも送られない（IndexedDB はそのブラウザの中だけ）。
 *
 * ## セーブとは別の DB にしてある
 *
 * 同じ DB に入れると、
 *   - 版の上げ下げがセーブと素材で絡む
 *   - 「さいしょから」で素材まで消える
 *   - バックアップの書き出しに画像が混ざる（**公衆送信の口が増える**）
 * の3つが起きる。**寿命も持ち主も違うものは、入れ物を分ける。**
 */

import { clearImages, imageCount, putImage } from "./source.js";
import type { ArtMatch } from "./match.js";

const DB_NAME = "pkmn-rpg-art";
const DB_VERSION = 1;
const ART = "art";

type ArtRecord = { name: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ART)) db.createObjectStore(ART, { keyPath: "name" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/**
 * ファイル名がそのまま絵の名前になる。
 *
 *   `tile-T.png`     → 木のマス
 *   `tile-grass.png` → 草むら
 *
 * **対応表を別に持たない。** 持つと「表に無い名前の画像を入れたのに出ない」が起きて、
 * 何が悪いのか分からなくなる。名前が合っていなければ、単に `drawn` のまま。
 */
export const artName = (fileName: string): string => fileName.replace(/\.[^.]+$/, "");

export type PutResult = {
  added: number;
  /** 画像でないので入れなかったもの。 */
  rejected: string[];
  /** 名前を直して入れたもの（`001.png` → `species-bulbasaur`）。 */
  renamed: number;
  /** 2種に当たったので**入れなかった**もの。 */
  ambiguous: string[];
  /** どの口にも当たらなかったもの。入れてはあるが使われない。 */
  unknown: string[];
};

/**
 * 素材を受け取ってしまう。
 *
 * **入り口で名前を直す**（v1.6-c）。差し替え口の名前は `species-pikachu` だが、
 * 手元の素材は `001.png` や `pikachu.png` で来る ――
 * パソコンなら `tools/collect-art.ts` で先に直せるが、
 * **スマホには node が無い。** 判定は `art/match.ts` にあるものを共有する。
 *
 * すでに当たっている名前（`tile-grass.png` など）は触らない。
 * 触ると、正しく名付けた人のファイルを勝手に読み替えることになる。
 */
export async function putArtFiles(
  files: readonly File[],
  resolve?: (fileName: string) => ArtMatch,
): Promise<PutResult> {
  const rejected: string[] = [];
  const keep = files.filter((file) => {
    if (file.type.startsWith("image/")) return true;
    rejected.push(file.name);
    return false;
  });

  const ambiguous: string[] = [];
  const unknown: string[] = [];
  let renamed = 0;
  const planned: { name: string; file: File }[] = [];
  for (const file of keep) {
    const found = resolve?.(file.name) ?? { kind: "already" as const, name: artName(file.name) };
    if (found.kind === "ambiguous") {
      // **迷ったら入れない。** 入れてしまうと、報告を読んだときには
      // もう間違った絵が使われている
      ambiguous.push(`${file.name} → ${found.candidates.join(" / ")}`);
      continue;
    }
    if (found.kind === "unknown") {
      unknown.push(file.name);
      planned.push({ name: artName(file.name), file });
      continue;
    }
    if (found.kind === "renamed") renamed += 1;
    planned.push({ name: found.name, file });
  }
  if (planned.length === 0) return { added: 0, rejected, renamed, ambiguous, unknown };

  const db = await openDb();
  try {
    const tx = db.transaction(ART, "readwrite");
    const store = tx.objectStore(ART);
    for (const { name, file } of planned) {
      store.put({ name, blob: file } satisfies ArtRecord);
    }
    await finished(tx);
  } finally {
    db.close();
  }
  return { added: planned.length, rejected, renamed, ambiguous, unknown };
}

/** Blob を1枚の画像にする。読めなければ `null`（**1枚欠けても止めない**）。 */
function decode(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * 置いてある素材を全部読み込む。返すのは読めた枚数。
 *
 * 起動時と、素材を足した直後に呼ぶ。**失敗しても遊べなくならない** ――
 * 読めなければ `drawn` が描くだけ。
 */
export async function loadArt(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  let records: ArtRecord[];
  try {
    const db = await openDb();
    try {
      records = await done<ArtRecord[]>(db.transaction(ART, "readonly").objectStore(ART).getAll());
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("そざいを よみこめませんでした", error);
    return 0;
  }

  clearImages();
  for (const record of records) {
    const image = await decode(record.blob);
    if (image !== null) putImage(record.name, image);
  }
  return imageCount();
}

/** 何枚置いてあるか（読み込む前に数だけ知りたいとき）。 */
export async function countArt(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await openDb();
    try {
      return await done<number>(db.transaction(ART, "readonly").objectStore(ART).count());
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/** 全部捨てる。**セーブには一切触らない。** */
export async function clearArt(): Promise<void> {
  clearImages();
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const tx = db.transaction(ART, "readwrite");
    tx.objectStore(ART).clear();
    await finished(tx);
  } finally {
    db.close();
  }
}

/** この環境に素材を置けるか。設定画面の表示に使う。 */
export async function artAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    (await openDb()).close();
    return true;
  } catch {
    return false;
  }
}
