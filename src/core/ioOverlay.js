// セーブの文字列入出力(A3)専用の、実DOM製オーバーレイ。
// canvas はテキスト選択・貼り付けができないので、この操作だけは
// 素のtextareaを重ねて出す。表示中はゲームのキー捕捉を input.js 側で止めている。

let els = null;

function bind() {
  if (els) return els;
  els = {
    overlay: document.getElementById('io-overlay'),
    label: document.getElementById('io-label'),
    text: document.getElementById('io-text'),
    msg: document.getElementById('io-msg'),
    confirm: document.getElementById('io-confirm'),
    cancel: document.getElementById('io-cancel'),
  };
  return els;
}

function hide() {
  const e = bind();
  e.overlay.hidden = true;
  e.confirm.onclick = null;
  e.cancel.onclick = null;
  e.text.onkeydown = null;
}

/** 書き出した文字列を読み取り専用で見せ、手でコピーしてもらう。 */
export function showExport(text) {
  const e = bind();
  e.overlay.hidden = false;
  e.label.textContent = 'したの もじれつを コピーしてください（すべて選択ずみ）。';
  e.msg.textContent = '';
  e.text.value = text;
  e.text.readOnly = true;
  e.confirm.hidden = true;
  e.cancel.textContent = 'とじる';
  e.cancel.onclick = hide;
  e.text.onkeydown = (ev) => { if (ev.key === 'Escape') hide(); };
  e.text.focus();
  e.text.select();
}

/**
 * 貼り付け用の空欄を見せる。「よみこむ」押下で onConfirm(text) を呼び、
 * { ok:true } なら成功メッセージのあと自動で閉じる。
 * { ok:false, reason } ならエラーメッセージを出して開いたままにする(やり直せる)。
 */
export function showImport(onConfirm) {
  const e = bind();
  e.overlay.hidden = false;
  e.label.textContent = 'コピーした もじれつを はりつけてください。';
  e.msg.textContent = '';
  e.text.value = '';
  e.text.readOnly = false;
  e.confirm.hidden = false;
  e.confirm.textContent = 'よみこむ';
  e.cancel.textContent = 'キャンセル';
  const reasonText = {
    none: 'もじれつが からです。',
    broken: 'もじれつが こわれているか、けいしきが ちがいます。',
    newer: 'これは あたらしすぎる バージョンの データです。',
  };
  e.confirm.onclick = () => {
    const res = onConfirm(e.text.value);
    if (res?.ok) {
      e.msg.style.color = '#206020';
      e.msg.textContent = 'よみこみました。';
      setTimeout(hide, 900);
    } else {
      e.msg.style.color = '#a03030';
      e.msg.textContent = reasonText[res?.reason] ?? 'よみこみに しっぱいしました。';
    }
  };
  e.cancel.onclick = hide;
  e.text.onkeydown = (ev) => { if (ev.key === 'Escape') hide(); };
  e.text.focus();
}
