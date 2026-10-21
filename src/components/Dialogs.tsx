import { useEffect, useRef, useState } from "react";
import { useSession } from "../lib/store";
import { Modal } from "./Overlay";

/** Renders the single confirm/prompt dialog and the toast from the session store. */
export function Dialogs() {
  const dialog = useSession((s) => s.dialog);
  const close = useSession((s) => s.closeDialog);
  const [val, setVal] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (dialog?.kind === "prompt") {
      setVal(dialog.initialValue ?? "");
      setTimeout(() => { input.current?.focus(); input.current?.select(); }, 50);
    }
  }, [dialog]);
  if (!dialog) return null;
  if (dialog.kind === "confirm") {
    return (
      <Modal onClose={close} label={dialog.title}>
        <h3>{dialog.title}</h3>
        {dialog.message && <p>{dialog.message}</p>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={close}>Cancel</button>
          <button className={dialog.danger ? "btn-danger" : "btn-accent"} onClick={() => { const cb = dialog.onConfirm; close(); cb(); }}>
            {dialog.confirmText ?? "Confirm"}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={close} label={dialog.title}>
      <h3>{dialog.title}</h3>
      <form onSubmit={(e) => { e.preventDefault(); const v = val.trim(); const cb = dialog.onConfirm; close(); if (v) cb(v); }}>
        <input ref={input} value={val} onChange={(e) => setVal(e.target.value)} placeholder={dialog.placeholder} autoComplete="off" aria-label={dialog.title} />
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn-ghost" type="button" onClick={close}>Cancel</button>
          <button className="btn-accent" type="submit">{dialog.confirmText ?? "Add"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Toast() {
  const t = useSession((s) => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!t) return;
    setShow(true);
    const h = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(h);
  }, [t]);
  return <div id="toastEl" className={show ? "show" : ""} role="status" aria-live="polite">{t?.msg}</div>;
}
