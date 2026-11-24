import { useEffect, useId, useState } from "react";
import axios from "axios";
import { getAuthConfig } from "../time-clock/time-clock.utils";
import { useShiftEditorLabels } from "./shift-editor.employees.component";
import { shiftTemplateDraftPatch, shiftTemplateFromDraft, validateShiftDraft } from "./shift-editor.utils.mjs";

const button = "min-h-10 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey disabled:opacity-50";
const field = "min-h-10 min-w-0 rounded-lg border border-darkBlue/15 bg-white px-2 text-sm";

export default function PlanningShiftTemplates({ restaurantId, draft, range, onChange }) {
  const { label } = useShiftEditorLabels();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/planning/templates`;

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    axios.get(endpoint, { ...getAuthConfig(), signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setTemplates(data.templates);
    }).catch(() => {
      if (!controller.signal.aborted) setError("templatesLoadError");
    });
    return () => controller.abort();
  }, [endpoint, open]);

  const template = templates?.find((item) => item._id === selected);
  const invalidDraft = validateShiftDraft(draft, range);

  async function save() {
    if (!name.trim() || invalidDraft || pending) return;
    setError("");
    setFeedback("");
    setPending(true);
    try {
      const { data } = await axios.post(endpoint, shiftTemplateFromDraft(name, draft, range), getAuthConfig());
      setTemplates((previous) => [...(previous || []), data.template]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setSelected(data.template._id);
      setName("");
      setFeedback("templateSaved");
    } catch (requestError) {
      setError(requestError.response?.status === 409 ? "templateDuplicate" : "templateSaveError");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!template || pending || !window.confirm(label("templateDeleteConfirm", { name: template.name }))) return;
    setError("");
    setFeedback("");
    setPending(true);
    try {
      await axios.delete(`${endpoint}/${template._id}`, getAuthConfig());
      setTemplates((previous) => previous.filter(({ _id }) => _id !== template._id));
      setSelected("");
      setFeedback("templateDeleted");
    } catch {
      setError("templateDeleteError");
    } finally {
      setPending(false);
    }
  }

  return <div className="mb-3 grid gap-3 rounded-xl border border-darkBlue/10 bg-lightGrey/50 p-3">
    <button type="button" className="w-fit text-sm font-semibold text-blue" aria-expanded={open}
      aria-controls={`${id}-templates`} disabled={pending} onClick={() => {
        setError("");
        setFeedback("");
        if (!open) setTemplates(null);
        setOpen(!open);
      }}>{label("shiftTemplates")}</button>
    {open && <div id={`${id}-templates`} className="grid gap-3">
      {templates === null && !error && <p role="status" className="text-sm">{label("templatesLoading")}</p>}
      {templates?.length === 0 && <p className="text-sm">{label("templatesEmpty")}</p>}
      {templates?.length > 0 && <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[8rem] flex-1 gap-1 text-sm font-semibold">{label("templateChoose")}
          <select className={field} value={selected} disabled={pending} onChange={(event) => setSelected(event.target.value)}>
            <option value="">{label("templatePlaceholder")}</option>
            {templates.map(({ _id, name, startTime, endTime }) => <option key={_id} value={_id}>{name} · {startTime}–{endTime}</option>)}
          </select>
        </label>
        {!draft.shiftId && <button className={button} type="button" disabled={!template || pending} onClick={() => {
          onChange(shiftTemplateDraftPatch(template, draft.date));
          setError("");
          setFeedback("templateApplied");
        }}>{label("templateApply")}</button>}
        <button className={`${button} text-red`} type="button" disabled={!template || pending} onClick={remove}>{label("templateDelete")}</button>
      </div>}
      {templates !== null && <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[8rem] flex-1 gap-1 text-sm font-semibold">{label("templateName")}
          <input className={field} value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              save();
            }} />
        </label>
        <button className={button} type="button" disabled={!name.trim() || Boolean(invalidDraft) || pending} onClick={save}>
          {label("templateSave")}
        </button>
      </div>}
      {error && <p role="alert" className="text-sm text-red">{label(error)}</p>}
      {feedback && <p role="status" className="text-sm text-darkBlue">{label(feedback)}</p>}
    </div>}
  </div>;
}
