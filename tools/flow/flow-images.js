/**
 * P11 - Image cards. An image card is a text card whose whole text is one inline image,
 * `![alt](data:image/...;base64,...)` (FlowStatic.imageCard). That is plain JSON Canvas markdown, so
 * other canvas apps show the picture too, and card images stay data: URLs only (no network request).
 * Added by dropping or pasting image files, the toolbar button, or I / 7. Images are downscaled and
 * re-encoded first so a chart stays small enough for localStorage autosave and Snippets sync.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const images = Flow.images = {};
    const MAX_SIDE = 1200;       // px, longest side kept
    const BUDGET = 400000;       // characters of data URL; shrink further until it fits
    const CARD_MAX = 320;        // world px, longest side of a new card
    let input, pendingReplace = null;

    images.init = function () {
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/gif,image/webp';
        input.hidden = true;
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            const files = [...(input.files || [])];
            const id = pendingReplace;
            input.value = '';
            pendingReplace = null;
            if (!files.length) return;
            if (id) images.replace(id, files[0]);
            else images.addFiles(files, core.viewCenter());
        });
        const btn = document.getElementById('flowImageBtn');
        if (btn) btn.addEventListener('click', () => images.choose());
    };

    images.isImageFile = (f) => !!f && /^image\/(png|jpeg|gif|webp)$/.test(f.type);

    /** Open the file picker: new image cards, or with an id, a new picture for that card. */
    images.choose = function (replaceId) {
        pendingReplace = replaceId || null;
        input.multiple = !replaceId;
        input.click();
    };

    async function decode(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            return img;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function hasAlpha(ctx, w, h) {
        const d = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < d.length; i += 28) if (d[i] < 255) return true;
        return false;
    }

    /** Downscale and re-encode: WebP where the browser can, else JPEG (PNG when transparent). */
    async function encode(file) {
        const img = await decode(file);
        const iw = img.naturalWidth, ih = img.naturalHeight;
        if (!iw || !ih) throw new Error('That image is empty');
        let scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
        for (let tries = 0; ; tries++) {
            const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            let src = cv.toDataURL('image/webp', 0.85);
            if (!src.startsWith('data:image/webp')) src = hasAlpha(ctx, w, h) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.85);
            if (src.length <= BUDGET || tries >= 5) return { src, w, h };
            scale *= 0.75;
        }
    }

    /** The alt text: the file name, without characters that would end the markdown image early. */
    function altOf(file) {
        return S.str(file && file.name).replace(/\.[^.]+$/, '').replace(/[[\]\r\n]+/g, ' ').trim().slice(0, 100);
    }

    function cardSize(w, h) {
        const k = Math.min(1, CARD_MAX / Math.max(w, h));
        return { width: Math.max(60, Math.round(w * k / 20) * 20), height: Math.max(40, Math.round(h * k / 20) * 20) };
    }

    /** New image cards from files, centred on world point `at`, side by side. False when none are images. */
    images.addFiles = async function (files, at) {
        const list = [...files].filter(images.isImageFile);
        if (!list.length) return false;
        let done;
        try { done = await Promise.all(list.map(async f => ({ f, img: await encode(f) }))); } catch (e) {
            core.toast('Could not read that image', 'error');
            return true;
        }
        const sizes = done.map(d => cardSize(d.img.w, d.img.h));
        const total = sizes.reduce((s, z) => s + z.width, 0) + 40 * (sizes.length - 1);
        let x = (at || core.viewCenter()).x - total / 2;
        const y = (at || core.viewCenter()).y;
        core.change(done.length > 1 ? 'Add images' : 'Add image', () => {
            const ids = done.map((d, i) => {
                const z = sizes[i];
                const n = Flow.nodes.createCard({ x: x + z.width / 2, y }, { text: `![${altOf(d.f)}](${d.img.src})`, width: z.width, height: z.height });
                x += z.width + 40;
                return n.id;
            });
            core.reindex();
            core.select(ids, []);
            core.invalidate('all');
        });
        return true;
    };

    /** A new picture for an image card: same width and alt text, height follows the picture. */
    images.replace = async function (id, file) {
        if (!images.isImageFile(file)) { core.toast('Choose a PNG, JPEG, GIF or WebP image', 'error'); return; }
        let img;
        try { img = await encode(file); } catch (e) { core.toast('Could not read that image', 'error'); return; }
        const n = core.getNode(id);
        if (!n) return;
        const old = S.imageCard(n);
        core.change('Replace image', () => {
            n.text = `![${old ? old.alt : altOf(file)}](${img.src})`;
            const h = Math.max(40, Math.round((Number(n.width) || 200) * img.h / img.w / 20) * 20);
            if (h !== Number(n.height)) n.height = h;
            Flow.edges.refreshAutoSides([n.id]);
            core.invalidate('all');
        });
    };
})();
