import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import QRCode from "qrcode";

export interface QrHandle { toBlob: () => Promise<Blob | null> }

/** Renders a high-error-correction QR code for an asset ID. */
export const Qr = forwardRef<QrHandle, { text: string; size?: number; small?: boolean }>(function Qr({ text, size = 180, small }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !text) return;
    QRCode.toCanvas(canvas.current, text, {
      width: size, margin: 0, errorCorrectionLevel: "H", color: { dark: "#14181D", light: "#FFFFFF" },
    }).catch((e) => console.error(e));
  }, [text, size]);
  useImperativeHandle(ref, () => ({
    toBlob: () => new Promise((res) => (canvas.current ? canvas.current.toBlob(res, "image/png") : res(null))),
  }));
  return (
    <div className={"qr-box" + (small ? " qr-box-sm" : "")}>
      <canvas ref={canvas} role="img" aria-label={`QR code for ${text}`} />
    </div>
  );
});
