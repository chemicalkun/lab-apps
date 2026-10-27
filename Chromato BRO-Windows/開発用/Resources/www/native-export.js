/* Cross-platform export: use a native NSSavePanel in the macOS WKWebView host.
 * Browser users fall back to the normal blob download mechanism. */
(() => {
  'use strict';
  window.GPCCopyImage = async function(blob) {
    if (!(blob instanceof Blob) || blob.type !== 'image/png') throw Error('PNG画像を作成できませんでした。');
    const handler = window.webkit?.messageHandlers?.copyImage;
    if (handler) {
      const dataURL = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error('コピーする画像を読み取れませんでした。'));
        reader.readAsDataURL(blob);
      });
      await handler.postMessage({base64:dataURL.slice(dataURL.indexOf(',')+1)});
    } else if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    } else {
      throw Error('この環境では画像コピーに対応していません。「PNG保存」をご利用ください。');
    }
  };
  window.GPCNativeExport = function gpcNativeExport(name, blob) {
    const handler = window.webkit?.messageHandlers?.saveFile;
    if (!handler || !(blob instanceof Blob)) return false;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const separator = text.indexOf(',');
      if (separator < 0) {
        alert('ファイルの保存データを読み取れませんでした。');
        return;
      }
      handler.postMessage({
        name: String(name || 'GPC-export'),
        base64: text.slice(separator + 1)
      });
    };
    reader.onerror = () => alert('ファイルの保存データを作成できませんでした。');
    reader.readAsDataURL(blob);
    return true;
  };
})();
