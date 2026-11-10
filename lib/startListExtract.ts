// Natrix: browser-side start-list PDF reader (text layer first, OCR fallback).
// This is the same reader the meet page has always used, moved into its own
// file so the admin upload page can use it too. Runs entirely in the browser.
// Do not import this from server code (it needs the browser canvas + pdf.js).

import { createWorker } from "tesseract.js";

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  // Point the worker at a plain static file in /public instead of relying
  // on the bundler to auto-detect `new URL("pdfjs-dist/...", import.meta.url)`
  // and package the worker for us. That auto-detection is built for literal
  // `new Worker(new URL(...))` calls; pdf.js constructs its worker
  // differently internally, so Next.js was never actually bundling the real
  // worker file - the browser silently loaded a broken/missing script, and
  // pdf.js only surfaced that later as a cryptic "undefined is not a
  // function" the first time something tried to actually use the worker.
  // A static file at a known path sidesteps bundler detection entirely.
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

async function extractTextFromTextLayer(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Item[] = (content.items as any[])
      .filter((it) => "str" in it && it.str.trim() !== "")
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

    if (items.length === 0) continue;

    const xs = [...new Set(items.map((it) => it.x))].sort((a, b) => a - b);
    let splitX: number | null = null;
    if (xs.length > 1) {
      const pageWidth = xs[xs.length - 1] - xs[0];
      let maxGap = 0;
      let gapMid = 0;
      for (let j = 1; j < xs.length; j++) {
        const gap = xs[j] - xs[j - 1];
        const mid = xs[j - 1] + gap / 2;
        const relPos = pageWidth > 0 ? (mid - xs[0]) / pageWidth : 0;
        if (gap > maxGap && relPos > 0.35 && relPos < 0.65) {
          maxGap = gap;
          gapMid = mid;
        }
      }
      if (maxGap > 40) {
        splitX = gapMid;
      }
    }

    // Guard against false-positive column detection: a single WIDE TABLE
    // (Lane | Name | Age | Team | Seed Time spread across the page width)
    // creates the same kind of big horizontal gap a genuine two-column
    // page does. But unlike a real two-column layout - where the left and
    // right blocks are two completely independent, unrelated flows of
    // content that never line up vertically - a wide table has left-side
    // and right-side content sitting at the EXACT SAME height, row after
    // row (the "Seed Time" for a row is printed level with that row's
    // "Name"). Check how many left-side rows have a right-side item at
    // the same y-coordinate; if most do, this isn't two columns, it's one
    // table, and splitting it would tear every row in half and scramble
    // the reading order.
    if (splitX !== null) {
      const leftYs = new Set(
        items.filter((it) => it.x < (splitX as number)).map((it) => Math.round(it.y / 3) * 3)
      );
      const rightYs = new Set(
        items.filter((it) => it.x >= (splitX as number)).map((it) => Math.round(it.y / 3) * 3)
      );
      let sharedY = 0;
      for (const y of leftYs) if (rightYs.has(y)) sharedY++;
      const overlapRatio = leftYs.size > 0 ? sharedY / leftYs.size : 0;
      if (overlapRatio > 0.4) {
        splitX = null; // false alarm - single wide table, not two columns
      }
    }

    const columns: Item[][] =
      splitX === null
        ? [items]
        : [
            items.filter((it) => it.x < (splitX as number)),
            items.filter((it) => it.x >= (splitX as number)),
          ];

    const pageLines: string[] = [];
    const Y_TOLERANCE = 2;

    for (const colItems of columns) {
      if (colItems.length === 0) continue;
      const sorted = [...colItems].sort((a, b) => b.y - a.y || a.x - b.x);
      const rows: Item[][] = [];
      for (const item of sorted) {
        const row = rows.find((r) => Math.abs(r[0].y - item.y) <= Y_TOLERANCE);
        if (row) row.push(item);
        else rows.push([item]);
      }
      const colLines = rows.map((row) =>
        row.sort((a, b) => a.x - b.x).map((it) => it.str).join(" ")
      );
      pageLines.push(...colLines);
    }

    fullText += pageLines.join("\n") + "\n";
  }

  return fullText;
}

// ─── OCR fallback (scanned / image-only PDFs) ────────────────────────────────
// Some start lists have NO real text layer at all - the whole results table
// is a single full-page image per page, with only a tiny caption as actual
// text. Text extraction has nothing real to return in that case, so we
// render each page to a canvas and run OCR on it instead, splitting into
// left/right halves first to preserve the same two-column reading order as
// the text-layer path above. This all runs in the browser - no server
// timeout risk, just a wait while your phone/laptop does the work.

// Canvas → Blob, wrapped as a Promise. Tesseract's worker runs in a separate
// thread and talks to the page via postMessage, which can carry a Blob but
// can't carry a live <canvas> element - handing it a raw canvas is what was
// throwing "undefined is not a function" on iOS Safari.
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not convert page image to a blob for OCR."));
    }, "image/png");
  });
}

async function extractTextViaOcr(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const worker = await createWorker("eng", 1, {
    logger: (m: any) => {
      if (m.status === "recognizing text") {
        onProgress?.(`Reading text (${Math.round(m.progress * 100)}%)...`);
      }
    },
  });
  await (worker as any).setParameters({ tessedit_pageseg_mode: "6" });

  let fullText = "";
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(`Reading page ${i} of ${pdf.numPages} (this can take a bit)...`);

      const page = await pdf.getPage(i);
      const scale = 3; // higher scale = sharper text = better OCR accuracy
      const viewport = page.getViewport({ scale });

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = viewport.width;
      pageCanvas.height = viewport.height;
      const pageCtx = pageCanvas.getContext("2d")!;
      // annotationMode: DISABLE skips rendering highlight/comment overlays
      // onto this image. Meets often send start lists with a swimmer's row
      // highlighted so parents can find their kid at a glance - great for a
      // human eye, but the colored overlay lowers the contrast OCR needs
      // and can make exactly the highlighted row unreadable while every
      // plain white row around it reads fine. Skipping annotations here
      // renders the page as if it were never highlighted, which is what we
      // want for OCR - this only affects the internal image OCR reads, not
      // anything shown to the user.
      await page.render({
        canvasContext: pageCtx,
        viewport,
        canvas: pageCanvas,
        annotationMode: 0, // AnnotationMode.DISABLE
      }).promise;

      const halfWidth = Math.floor(pageCanvas.width / 2);
      const halves: [number, number][] = [
        [0, halfWidth],
        [halfWidth, pageCanvas.width - halfWidth],
      ];

      for (const [startX, w] of halves) {
        const colCanvas = document.createElement("canvas");
        colCanvas.width = w;
        colCanvas.height = pageCanvas.height;
        const colCtx = colCanvas.getContext("2d")!;
        colCtx.drawImage(pageCanvas, startX, 0, w, pageCanvas.height, 0, 0, w, pageCanvas.height);

        const blob = await canvasToBlob(colCanvas);
        const { data: ocrData } = await worker.recognize(blob);
        fullText += ocrData.text + "\n";
      }
    }
  } finally {
    await worker.terminate();
  }

  return fullText;
}

export async function extractStartListText(
  file: File,
  onProgress?: (message: string) => void
): Promise<{ text: string; usedOcr: boolean; textLayerError: string | null; textLayerChars: number }> {
  onProgress?.("Reading PDF text...");

  // The text-layer attempt is wrapped so that ANY failure here (not just
  // "no text found") falls through to OCR rather than failing the whole
  // upload - text-layer reading is a nice-to-have fast path, OCR is the
  // path that actually has to work for image-only PDFs like this one.
  // The error (if any) and character count are captured and surfaced in
  // the debug panel - without them there's no way to tell, from the app
  // alone, WHY a PDF with a perfectly good text layer still fell back to
  // OCR (which is otherwise invisible - OCR output can look plausible
  // while quietly getting individual characters wrong).
  let textLayerResult = "";
  let textLayerError: string | null = null;
  try {
    textLayerResult = await extractTextFromTextLayer(file);
  } catch (err) {
    textLayerError = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("Text-layer extraction failed, falling back to OCR:", err);
  }

  // Heuristic: a real text layer for a start list should contain at least
  // one "Event ..." header. If it doesn't, there's no usable text layer -
  // the PDF is image-only - so fall back to OCR.
  const looksLikeRealTextLayer = /Event\s+\d+/i.test(textLayerResult);
  if (looksLikeRealTextLayer) {
    return { text: textLayerResult, usedOcr: false, textLayerError: null, textLayerChars: textLayerResult.length };
  }

  onProgress?.("No readable text found - running OCR instead...");
  const ocrResult = await extractTextViaOcr(file, onProgress);
  return { text: ocrResult, usedOcr: true, textLayerError, textLayerChars: textLayerResult.length };
}
