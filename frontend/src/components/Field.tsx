import React from "react";
import * as cx from "../styles/classes";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx.field}>
      <span className={cx.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
