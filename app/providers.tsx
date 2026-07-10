"use client";

import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { PfMotionConfig } from "@/components/motion/pf-motion-config";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="obsidian"
      themes={["obsidian", "parchment", "high_contrast"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      <PfMotionConfig>{children}</PfMotionConfig>
    </ThemeProvider>
  );
}
