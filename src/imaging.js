/* أدوات الصور المشتركة (تعمل في صفحات الإضافة والسكربت المحقون): تصغير، تدوير، دمج، تحويل إلى ملف */
(function (g) {
  'use strict';

  const loadImg = url => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('تعذر قراءة الصورة'));
    im.src = url;
  });
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const jpeg = (c, q) => c.toDataURL('image/jpeg', q || 0.9);

  /* ملف صورة ← JPEG بحد أقصى للبعد الأكبر */
  async function fromFile(file, max = 1280) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = canvas(bmp.width * k, bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return jpeg(c);
  }

  /* نسخة مصغّرة (لكشف الاتجاه: أسرع وأرخص) */
  async function shrink(dataUrl, max = 640) {
    const im = await loadImg(dataUrl);
    const k = Math.min(1, max / Math.max(im.width, im.height));
    if (k === 1) return dataUrl;
    const c = canvas(im.width * k, im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return jpeg(c, 0.8);
  }

  /* تدوير باتجاه عقارب الساعة: 0 / 90 / 180 / 270 */
  async function rotate(dataUrl, deg) {
    deg = ((deg % 360) + 360) % 360;
    if (!deg) return dataUrl;
    const im = await loadImg(dataUrl);
    const swap = deg === 90 || deg === 270;
    const c = canvas(swap ? im.height : im.width, swap ? im.width : im.height);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(im, -im.width / 2, -im.height / 2);
    return jpeg(c);
  }

  /* دمج عدة صور عمودياً في صورة واحدة بيضاء الخلفية */
  async function merge(urls, maxW = 1600) {
    if (!urls.length) return '';
    if (urls.length === 1) return urls[0];
    const imgs = await Promise.all(urls.map(loadImg));
    const gap = 16;
    const W = Math.min(maxW, Math.max(...imgs.map(i => i.width)));
    const dims = imgs.map(i => { const s = Math.min(1, W / i.width); return { i, w: Math.round(i.width * s), h: Math.round(i.height * s) }; });
    const totalH = dims.reduce((a, d) => a + d.h, 0) + gap * (dims.length - 1);
    const scale = totalH > 4000 ? 4000 / totalH : 1;
    const c = canvas(W * scale, totalH * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    let y = 0;
    for (const d of dims) {
      const dw = Math.round(d.w * scale), dh = Math.round(d.h * scale);
      ctx.drawImage(d.i, Math.round((c.width - dw) / 2), y, dw, dh);
      y += dh + Math.round(gap * scale);
    }
    return jpeg(c);
  }

  function dataUrlToFile(dataUrl, name) {
    const b = atob(dataUrl.split(',')[1]), u = new Uint8Array(b.length);
    for (let j = 0; j < b.length; j++) u[j] = b.charCodeAt(j);
    return new File([u], name, { type: 'image/jpeg' });
  }

  g.HSImg = { fromFile, shrink, rotate, merge, dataUrlToFile };
})(globalThis);
