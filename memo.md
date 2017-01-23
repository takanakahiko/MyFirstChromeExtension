# 拡張機能の種類

## Browser Action
特定のWebページを対象としない。

## Page Action
特定のWebページを対象とする。

## Override Pages
ブラウザ特有の画面(ブックマークエクスプローラ)等を弄る。

# ソースの構成

## Content-Script
* Webページの中に挿入するCSSとJavaScriptのこと
* WebページのDOMをいじったり

## Background-Page
* chrome拡張の統括
* 'Content-Script'から受け取ったイベントに応じて動作(要するにハンドラを作っておく)
* Event-Pageというものに設定すると、メモリを適宜開放してエコ

## Content-ScriptとBackground-Pageの通信

```:JavaScript
// イベントハンドラーをセットする
chrome.runtime.onMessage.addListener(function (message) {
  console.log(message);
});

// メッセージ送信する
chrome.runtime.sendMessage('YO!');
```
