import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Renders page 1 of a PDF File to a PNG Blob at a print-friendly resolution.
 * Floor plans always end up stored as an image (see uploadFloorPlanImage) —
 * this is the only PDF-specific step, so the rest of the app never has to
 * think about PDF vs. image.
 *
 * This module (and the ~1MB pdfjs-dist it pulls in) is loaded via a dynamic
 * import() only when someone actually uploads a PDF — see FloorPlanImport.jsx.
 * Importing it statically would ship pdfjs to every field technician's phone
 * on every page load, which is the wrong tradeoff for a low-bandwidth PWA.
 */
export async function renderPdfFirstPageToPng(file, targetWidth = 1600) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}
