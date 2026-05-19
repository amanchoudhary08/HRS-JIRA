import React, { useEffect, useRef, useState } from "react";
import type { Label } from "../types";
import { LabelChip } from "./LabelChip";
import * as cx from "../styles/classes";

/**
 * Multi-select dropdown for labels.
 * Shows currently applied labels as chips with a ×.
 * Clicking the "＋ Labels" button opens a dropdown of available labels.
 */
export function LabelPicker({
  allLabels,
  selectedIds,
  onAttach,
  onDetach,
}: {
  allLabels: Label[];
  selectedIds: string[];
  onAttach: (labelId: string) => void;
  onDetach: (labelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const selected = allLabels.filter((l) => selectedIds.includes(l.id));
  const available = allLabels.filter((l) => !selectedIds.includes(l.id));

  return (
    <div className={cx.labelPickerWrap} ref={wrapRef}>
      <div className={cx.labelPickerChips}>
        {selected.map((l) => (
          <LabelChip key={l.id} label={l} onRemove={() => onDetach(l.id)} />
        ))}
        <button
          type="button"
          className={cx.labelPickerToggle}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          ＋ Labels
        </button>
      </div>

      {open && (
        <div className={cx.labelPickerDropdown} role="listbox">
          {allLabels.length === 0 && (
            <div className={cx.searchEmpty}>
              No labels yet — create some below
            </div>
          )}
          {available.map((l) => (
            <button
              key={l.id}
              type="button"
              className={cx.labelPickerOption}
              role="option"
              onClick={() => {
                onAttach(l.id);
                setOpen(false);
              }}
            >
              <span className={cx.labelDot} style={{ background: l.color }} />
              {l.name}
            </button>
          ))}
          {available.length === 0 && allLabels.length > 0 && (
            <div className={cx.searchEmpty}>All labels applied</div>
          )}
        </div>
      )}
    </div>
  );
}
