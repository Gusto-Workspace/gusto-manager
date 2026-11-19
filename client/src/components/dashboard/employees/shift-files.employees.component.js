import { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import styles from "./shift-editor.module.scss";

const maxFiles = 6;
const maxFileSize = 10 * 1024 * 1024;

export default function ShiftFiles({ url, label, onFileBusy }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [removalPending, setRemovalPending] = useState(false);
  const pending = useRef(false);
  const fileInput = useRef(null);
  const fileRulesId = useId();

  useEffect(() => {
    const controller = new AbortController();
    axios.get(url, { signal: controller.signal }).then(({ data }) => {
      setFiles(data.files);
    }).catch(() => {
      if (!controller.signal.aborted) setError("fileError");
    });
    return () => controller.abort();
  }, [url]);

  async function run(operation) {
    if (pending.current) return;
    pending.current = true;
    onFileBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError("fileError");
    } finally {
      pending.current = false;
      onFileBusy(false);
    }
  }

  function upload(event) {
    const selected = Array.from(event.target.files);
    event.target.value = "";
    if (!selected.length) return;
    if (selected.length + files.length > maxFiles ||
        selected.some((file) => file.size > maxFileSize || !/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name))) {
      setError("fileRules");
      return;
    }
    run(async () => {
      const body = new FormData();
      selected.forEach((file) => body.append("files", file));
      setUploading(true);
      try {
        const { data } = await axios.post(url, body);
        setFiles(data.files);
      } catch (error) {
        const { data } = await axios.get(url);
        setFiles(data.files);
        throw error;
      } finally {
        setUploading(false);
      }
    });
  }

  function download(file) {
    run(async () => {
      const { data } = await axios.get(`${url}/${file._id}/download`, { responseType: "blob" });
      const localUrl = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = localUrl;
      link.download = file.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
    });
  }

  function remove(file) {
    run(async () => {
      const { status } = await axios.delete(`${url}/${file._id}`);
      if (status === 202) setRemovalPending(true);
      setFiles((previous) => previous.filter(({ _id }) => _id !== file._id));
      setConfirm(null);
    });
  }

  return (
    <section className={styles.section}>
      <h3><Paperclip size={17} aria-hidden="true" />{label("files")}</h3>
      {files?.length === 0 && <p>{label("noFiles")}</p>}
      {files?.length > 0 && <ul>
        {files.map((file) => <li key={file._id} className={styles.fileRow}>
          <span>{file.filename}</span>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={() => download(file)}
              aria-label={label("fileDownload", { name: file.filename })}><Download size={16} aria-hidden="true" /></button>
            <button className={styles.delete} type="button" onClick={() => setConfirm(file._id)}
              aria-label={label("fileRemove", { name: file.filename })}><Trash2 size={16} aria-hidden="true" /></button>
            {confirm === file._id && <>
              <button className={styles.secondary} type="button" onClick={() => setConfirm(null)}>{label("cancel")}</button>
              <button className={styles.delete} type="button" onClick={() => remove(file)}
                aria-label={label("fileConfirm", { name: file.filename })}>{label("delete")}</button>
            </>}
          </div>
        </li>)}
      </ul>}
      {files && files.length < maxFiles && (
        <>
          <input ref={fileInput} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" onChange={upload} />
          <button
            type="button"
            className={`${styles.secondary} ${styles.filePickerButton}`}
            aria-describedby={fileRulesId}
            onClick={() => fileInput.current.click()}
          >
            <Upload size={16} aria-hidden="true" />
            {label("fileChoose")}
          </button>
        </>
      )}
      <p id={fileRulesId}>{label("fileRules")}</p>
      {uploading && <p role="status">{label("fileUploading")}</p>}
      {removalPending && <p role="status">{label("fileRemovalPending")}</p>}
      {error && <p className={styles.problem} role="alert">{label(error)}</p>}
      {!files && error && <button type="button" className={styles.textButton} onClick={() => run(async () => {
        const { data } = await axios.get(url);
        setFiles(data.files);
      })}>{label("fileRetry")}</button>}
    </section>
  );
}
