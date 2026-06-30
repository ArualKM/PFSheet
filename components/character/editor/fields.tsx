"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  integer = true,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Coerce committed values to whole numbers (default: true — most stats are ints). */
  integer?: boolean;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  // Local string draft so the field can be cleared and accept a leading "-"
  // without the controlled value snapping back to 0 mid-edit.
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  const [seen, setSeen] = useState(value);
  // Re-sync the draft when the model value changes from elsewhere (undo, live
  // recompute) — the React "adjust state on prop change" pattern, not an effect.
  if (value !== seen) {
    setSeen(value);
    setText(Number.isFinite(value) ? String(value) : "");
  }

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") return; // wait for a real number
    let n = Number(raw);
    if (Number.isNaN(n)) return;
    if (integer) n = Math.trunc(n);
    onChange(n);
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode={!integer ? "decimal" : min !== undefined && min >= 0 ? "numeric" : "decimal"}
        value={text}
        min={min}
        max={max}
        step={integer ? 1 : undefined}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          if (text === "" || text === "-") {
            setText("0");
            onChange(0);
            return;
          }
          const n = Number(text);
          if (!Number.isNaN(n)) setText(String(integer ? Math.trunc(n) : n));
        }}
        className="tnum"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
  /** Applied to the <input> itself (e.g. `font-mono` for formula fields) — `className` styles the wrapper. */
  inputClassName?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClassName} />
      {hint && <p className="text-[11px] text-warning">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm md:h-10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
