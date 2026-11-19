import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Copy, MoreVertical, Trash2 } from "lucide-react";
import { cellCopyTargets, cellKey, dropEntry, isSourceCell } from "./planning-actions.utils.mjs";
import styles from "./planning-grid.module.scss";

function cellFromNode(node) {
  const element = node?.closest?.("[data-planning-cell]");
  if (!element) return null;
  return { key: element.dataset.planningCell, employeeId: element.dataset.employeeId, date: element.dataset.date };
}

function pointerTarget(event) {
  const elements = document.elementsFromPoint(event.clientX, event.clientY);
  const element = elements.map((node) => node.closest("[data-planning-cell]")).find(Boolean);
  if (!element) return {};
  const rect = element.getBoundingClientRect();
  const move = element.dataset.planningDropAxis === "vertical"
    ? event.clientY < rect.top + rect.height / 2
    : event.clientX < rect.left + rect.width / 2;
  return { cell: cellFromNode(element), operation: move ? "move" : "copy" };
}

function ghostPosition(x, y) {
  return { left: Math.min(x + 13, innerWidth - 157), top: Math.min(y + 16, innerHeight - 50) };
}

export function usePlanningDrag(commands, rows) {
  const gesture = useRef(null);
  const suppressed = useRef(null);
  const ghost = useRef(null);
  const [preview, setPreview] = useState(null);

  function end(current) {
    gesture.current = null;
    setPreview(null);
    if (current.moved) {
      suppressed.current = current.element;
      setTimeout(() => {
        if (suppressed.current === current.element) suppressed.current = null;
      }, 0);
    }
    if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
  }

  useEffect(() => {
    const escape = (event) => {
      if (event.key !== "Escape" || !gesture.current) return;
      event.preventDefault();
      end(gesture.current);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  function start(event, cell, mode, shifts) {
    if (!commands?.enabled || commands.busy || event.button !== 0 ||
        event.shiftKey || event.altKey || event.metaKey || event.ctrlKey ||
        (mode === "card" && event.pointerType === "touch")) return;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    gesture.current = { element, pointer: event.pointerId, shifts, cell, mode, x: event.clientX, y: event.clientY, moved: false };
  }

  function move(event) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    current.moved = true;
    event.preventDefault();
    const { cell, operation } = pointerTarget(event);
    const { left, top } = ghostPosition(event.clientX, event.clientY);
    if (ghost.current) {
      ghost.current.style.left = `${left}px`;
      ghost.current.style.top = `${top}px`;
    }
    const targetKey = cell?.key || "";
    if (current.targetKey === targetKey && current.operation === operation) return;
    current.targetKey = targetKey;
    current.operation = operation;
    const destinations = cell && current.mode === "fill"
      ? cellCopyTargets(rows, current.cell, cell)
      : [];
    setPreview({
      shift: current.shifts[0], mode: current.mode,
      cell: current.mode === "card" && cell && !isSourceCell(current.shifts[0], cell) ? cell : null,
      operation, keys: new Set(destinations.map(cellKey)),
      count: destinations.length * current.shifts.length,
      sourceCount: current.shifts.length,
      left, top,
    });
  }

  function finish(event) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    end(current);
    if (!current.moved) return;
    const { cell, operation } = pointerTarget(event);
    if (!cell) return;
    if (current.mode === "fill") {
      commands.duplicate(current.shifts, current.cell, cellCopyTargets(rows, current.cell, cell));
    } else if (!isSourceCell(current.shifts[0], cell)) {
      commands.execute({ operation, entries: [dropEntry(current.shifts[0], cell)] });
    }
  }

  function cancel(event) {
    const current = gesture.current;
    if (current?.pointer === event.pointerId) end(current);
  }

  function wasDrag(event) {
    if (event.detail && suppressed.current === event.currentTarget) {
      suppressed.current = null;
      event.preventDefault();
      return true;
    }
    return false;
  }

  return { preview, ghost, start, move, finish, cancel, wasDrag };
}

export function useShiftMenu() {
  const [menu, setMenu] = useState(null);
  const trigger = useRef(null);

  const close = useCallback((restore = true) => {
    setMenu(null);
    if (restore && trigger.current?.isConnected) trigger.current.focus();
  }, []);

  function open(event, button, cell) {
    if (menu?.event.id === event.id && menu.cell.key === cell.key) return close();
    trigger.current = button;
    const rect = button.getBoundingClientRect();
    const below = rect.bottom + 5;
    setMenu({
      event, cell,
      left: Math.max(8, Math.min(rect.left, innerWidth - 188)),
      top: Math.max(8, below + 45 <= innerHeight - 8 ? below : rect.top - 50),
    });
  }

  return { menu, open, close, trigger };
}

export function ShiftContextMenu({ state, commands }) {
  const { menu, close, trigger } = state;
  const list = useRef(null);

  useEffect(() => {
    if (!menu) return;
    list.current?.querySelector("button")?.focus();
    function outside(event) {
      if (!list.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    }
    function resize() { close(false); }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", resize);
    };
  }, [menu, close, trigger]);

  if (!menu) return null;
  function navigate(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") close();
    else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) event.preventDefault();
  }
  return createPortal(
    <div role="menu" aria-label={commands.label("menu")} ref={list} onKeyDown={navigate} className={styles.shiftMenu}
      style={{ left: menu.left, top: menu.top }}>
      <button type="button" tabIndex={-1} role="menuitem" className={styles.commandDanger}
        onClick={() => { close(); commands.open({ type: "delete", events: [menu.event] }); }}>
        <Trash2 size={15} aria-hidden="true" />{commands.label("delete")}
      </button>
    </div>, document.body,
  );
}

export function ShiftMenuTrigger({ shift, menuState, cell, label, busy }) {
  return <button type="button" className={styles.shiftMenuTrigger} disabled={busy}
    aria-label={label} aria-haspopup="menu"
    aria-expanded={menuState.menu?.event.id === shift.id && menuState.menu.cell.key === cell.key}
    onClick={(e) => menuState.open(shift, e.currentTarget, cell)}><MoreVertical size={15} aria-hidden="true" /></button>;
}

function CopyHandle({ cell, interactions }) {
  const { commands, drag } = interactions;
  const label = commands.label("cellHandle");
  return <button type="button" className={styles.copyHandle} disabled={commands.busy}
    aria-label={label} title={label} data-planning-selection-control
    onPointerDown={(e) => drag.start(e, cell, "fill", cell.events)}
    onPointerMove={drag.move} onPointerUp={drag.finish} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel}
    onClick={(e) => { if (!drag.wasDrag(e)) commands.open({ type: "duplicate", events: cell.events, origin: cell }); }} />;
}

export function CellSelection({ cell, interactions }) {
  const { commands } = interactions;
  return <>
    <button type="button" className={styles.cellSelect} disabled={commands.busy}
      aria-label={`${commands.label("selectCell")} · ${cell.name} · ${cell.date}`}
      aria-pressed={cell.selected} data-planning-selection-control onClick={() => commands.selectCell(cell)} />
    {cell.selected && <CopyHandle {...{ cell, interactions }} />}
  </>;
}

export function DropChoices({ drag, cell, label }) {
  const preview = drag.preview;
  if (preview?.mode !== "card" || preview.cell?.key !== cell.key) return null;
  return <div aria-hidden="true" className={styles.dropChoices}>
    {[["move", ArrowRight], ["copy", Copy]].map(([operation, Icon]) => <span key={operation}
      data-planning-drop-operation={operation} data-active={preview.operation === operation || undefined}>
      <Icon size={12} />{label(operation)}
    </span>)}
  </div>;
}

export function DragPreview({ preview, ghost, label, time }) {
  if (!preview) return null;
  return createPortal(
    <div ref={ghost} aria-hidden="true" className={styles.dragPreview}
      style={{ left: preview.left, top: preview.top }}>
      <strong>{preview.mode === "fill" && preview.sourceCount > 1
        ? label("cellShiftCount", { count: preview.sourceCount })
        : `${time(preview.shift.start)} – ${time(preview.shift.end)}`}</strong>
      <span>{preview.mode === "fill" ? label("copyCount", { count: preview.count }) : preview.shift.position}</span>
    </div>, document.body,
  );
}

export function cellInteractionProps(cell, drag, vertical = false) {
  const preview = drag.preview;
  return {
    "data-planning-cell": cell.key,
    "data-employee-id": cell.employeeId,
    "data-date": cell.date,
    "data-planning-drop-axis": vertical ? "vertical" : "horizontal",
    "data-planning-selected": cell.selected || undefined,
    "data-planning-target": preview?.cell?.key === cell.key || undefined,
    "data-planning-fill": preview?.keys?.has(cellKey(cell)) || undefined,
  };
}

