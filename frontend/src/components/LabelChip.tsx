import React from "react";
import type { Label } from "../types";
import * as cx from "../styles/classes";

/** Renders a small coloured pill for a label */
export function LabelChip({
  label,
  onRemove,
}: {
  label: Label;
  onRemove?: () => void;
}) {
  // Derive a readable text colour (white or dark) based on background
  const textColor = contrastColor(label.color);
  return (
    <span
      className={cx.labelChip}
      style={{ background: label.color, color: textColor }}
    >
      {label.name}
      {onRemove && (
        <button
          className={cx.labelChipRemove}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove label ${label.name}`}
          style={{ color: textColor }}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Simple luminance check — returns white or near-black */
function contrastColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1e2623" : "#ffffff";
}
