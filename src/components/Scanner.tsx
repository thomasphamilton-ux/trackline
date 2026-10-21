import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from "html5-qrcode";
import { toast, useSession } from "../lib/store";

export type ScanType = "add" | "seal" | "link";

const TITLES: Record<ScanType, string> = { add: "Scan asset QR code", seal: "Scan tamper seal", link: "Scan code to link" };
const HINTS: Record<ScanType, string> = {
  add: "Point the camera at the QR code. It scans automatically.",
  seal: "Frame just the barcode inside the box, as close as your camera can still focus.",
  link: "Frame just the code inside the box, as close as your camera can still focus.",
};

/** Camera scanner with typed fallback, and photo OCR for seals and linked codes. */
export function Scanner({ type, onResult, onClose }: { type: ScanType; onResult: (code: string) => void; onClose: () => void }) {
  const [manual, setManual] = useState("");
  const inst = useRef<Html5Qrcode | null>(null);
  const done = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const finish = (code: string) => {
    if (done.current) return;
    done.current = true;
    onResult(code.trim());
  };

  useEffect(() => {
    document.body.classList.add("no-scroll");
    const q = new Html5Qrcode("reader", {
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
        F.UPC_EAN_EXTENSION, F.ITF, F.RSS_14, F.RSS_EXPANDED, F.AZTEC, F.DATA_MATRIX, F.PDF_417, F.MAXICODE],
    });
    inst.current = q;
    q.start(
      { facingMode: "environment" },
      {
        fps: 10,
        disableFlip: false,
        qrbox: (w, h) => {
          if (type === "seal" || type === "link") return { width: Math.round(Math.min(w * 0.6, 260)), height: Math.round(Math.min(h * 0.14, 90)) };
          const side = Math.round(Math.min(Math.min(w, h) * 0.7, 280));
          return { width: side, height: side };
        },
      },
      (text) => finish(String(text)),
      () => { /* per-frame miss */ },
    ).catch((e) => { console.error(e); toast("Camera unavailable. Type the code below instead."); });
    return () => {
      document.body.classList.remove("no-scroll");
      const cur = inst.current;
      inst.current = null;
      if (cur?.isScanning) cur.stop().then(() => cur.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const ocr = async (file: File) => {
    onClose();
    toast("Reading photo. Trying a few orientations, this can take a bit…");
    try {
      const code = await readCodeFromPhoto(file);
      if (!code) return toast("Couldn't make out a short code at any angle. Try again or type the code.");
      useSession.getState().prompt({
        title: "Confirm the code", placeholder: "Edit if anything looks wrong", initialValue: code, confirmText: "Use this code",
        onConfirm: (v) => onResult(v),
      });
    } catch (e) { console.error(e); toast("Couldn't read that photo. Try again or type the code."); }
  };

  return (
    <div className="overlay" id="scannerOverlay">
      <div className="scan-sheet" role="dialog" aria-modal="true" aria-label={TITLES[type]}>
        <div className="scan-head">
          <h2>{TITLES[type]}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close" style={{ background: "#1a1d21", borderColor: "#333", color: "#fff" }}>✕</button>
        </div>
        <div id="reader" />
        <div className="scan-foot">
          <div className="scan-hint">{HINTS[type]}</div>
          <form className="manual-row" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) finish(manual); }}>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type the code here" autoComplete="off" aria-label="Code" />
            <button className="btn-accent" type="submit">Use</button>
          </form>
          {(type === "seal" || type === "link") && (
            <button className="btn-ghost" type="button" onClick={() => fileInput.current?.click()}>Can't get it to scan? Take a photo instead</button>
          )}
          <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ocr(f); }} />
        </div>
      </div>
    </div>
  );
}

function rotate(img: HTMLImageElement, deg: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const w = img.naturalWidth, h = img.naturalHeight;
  [c.width, c.height] = deg === 90 || deg === 270 ? [h, w] : [w, h];
  const g = c.getContext("2d")!;
  if (deg === 90) { g.translate(c.width, 0); g.rotate(Math.PI / 2); }
  else if (deg === 180) { g.translate(c.width, c.height); g.rotate(Math.PI); }
  else if (deg === 270) { g.translate(0, c.height); g.rotate(-Math.PI / 2); }
  g.drawImage(img, 0, 0, w, h);
  return c;
}

/** Same approach as the legacy app: single-label mode, uppercase/digits/dash, best of 4 rotations. */
async function readCodeFromPhoto(file: File): Promise<string | null> {
  const { createWorker } = await import("tesseract.js");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_pageseg_mode: "11" as any, tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" });
    let best: { text: string; conf: number } | null = null;
    for (const deg of [0, 90, 270, 180]) {
      try {
        const r = await worker.recognize(deg === 0 ? img : rotate(img, deg));
        const cleaned = (r.data.text || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").trim();
        if (cleaned && cleaned.length <= 20 && (!best || r.data.confidence > best.conf)) best = { text: cleaned, conf: r.data.confidence };
      } catch (e) { console.error(e); }
    }
    await worker.terminate();
    return best?.text ?? null;
  } finally { URL.revokeObjectURL(url); }
}
