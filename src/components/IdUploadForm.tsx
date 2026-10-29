"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IdDocumentInput, type PickedFile } from "./IdDocumentInput";

/** Upload an ID after sign-up (member portal or admin). Refreshes the page when done. */
export function IdUploadForm({ slug, policyId, label }: { slug: string; policyId: string; label?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!file) return setError("Choose a photo or file first.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/${slug}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId, file: { name: file.name, mime: file.mime, data: file.data } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed. Try again.");
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-s">
      <IdDocumentInput value={file} onChange={(f) => { setFile(f); setError(""); }} error={error} label={label} />
      {file && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={send} disabled={busy}>{busy ? "Uploading…" : "Upload ID"}</button>}
    </div>
  );
}
