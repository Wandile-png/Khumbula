"use client";

import { useState } from "react";

const HIDDEN: React.CSSProperties = { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" };

export type PickedFile = { name: string; mime: string; data: string; size: number; preview: string | null };

const MAX = 3 * 1024 * 1024;
const LONG_SIDE = 1600;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

/** Phone photos are often 4–8 MB. Shrink to 1600 px on the long side as JPEG: still readable, usually under 500 KB. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82));
}

export async function prepareFile(file: File): Promise<PickedFile> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > MAX) throw new Error("That PDF is larger than 3 MB. Take a photo of the ID instead.");
    return { name: file.name, mime: "application/pdf", data: await readAsDataUrl(file), size: file.size, preview: null };
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error("Upload a photo or a PDF of the ID.");
  }
  let blob: Blob;
  try {
    blob = await shrinkPhoto(file);
  } catch {
    throw new Error("We couldn't read that photo. Try taking it again, or upload a JPG or PDF.");
  }
  if (blob.size > MAX) throw new Error("That photo is still too large. Try again closer to the ID.");
  const data = await readAsDataUrl(blob);
  const base = file.name.replace(/\.[^.]+$/, "") || "id-photo";
  return { name: base + ".jpg", mime: "image/jpeg", data, size: blob.size, preview: data };
}

const kb = (n: number) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

/** File picker with "take photo" support on phones. Used in sign-up, the member portal and admin. */
export function IdDocumentInput({ value, onChange, error, label = "Copy of your ID" }: { value: PickedFile | null; onChange: (f: PickedFile | null) => void; error?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setLocalError("");
    try {
      onChange(await prepareFile(f));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Couldn't use that file.");
    } finally {
      setBusy(false);
    }
  }

  const shown = localError || error;
  return (
    <div className="stack-s">
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span className="muted small">A clear photo of your green ID book or both sides of your smart ID card, or a scanned PDF. Stored encrypted and seen only by our staff.</span>
      {value ? (
        <div className="panel row between" style={{ padding: 12 }}>
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            {value.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.preview} alt="Your ID photo" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
            ) : (
              <span className="chip s-SENT">PDF</span>
            )}
            <span className="small" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{value.name} · {kb(value.size)}</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <div className="row">
          {busy ? (
            <span className="muted small">Preparing your file…</span>
          ) : (
            <>
              {/* Labels wrapping the inputs open the camera or file picker reliably on iPhone and Android. */}
              <label className="btn sm">Take a photo<input type="file" accept="image/*" capture="environment" style={HIDDEN} onChange={pick} /></label>
              <label className="btn ghost sm">Upload a file<input type="file" accept="image/*,application/pdf" style={HIDDEN} onChange={pick} /></label>
            </>
          )}
        </div>
      )}
      {shown && <span className="err">{shown}</span>}
    </div>
  );
}
