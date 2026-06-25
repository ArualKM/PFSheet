"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";

const ORDER = ["obsidian", "parchment", "high_contrast"] as const;
const META: Record<(typeof ORDER)[number], { label: string; Icon: typeof Moon }> = {
  obsidian: { label: "Obsidian", Icon: Moon },
  parchment: { label: "Parchment", Icon: Sun },
  high_contrast: { label: "High contrast", Icon: Contrast },
};

const noopSubscribe = () => () => {};

/** True only after client hydration — avoids a theme-icon mismatch warning. */
function useMounted() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const current = (mounted && theme && (ORDER as readonly string[]).includes(theme)
    ? theme
    : "obsidian") as (typeof ORDER)[number];
  const { Icon, label } = META[current];

  const cycle = () => {
    const idx = ORDER.indexOf(current);
    setTheme(ORDER[(idx + 1) % ORDER.length]!);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${label}. Click to switch.`}
      title={`Theme: ${label}`}
    >
      <Icon className="size-4" />
    </Button>
  );
}
