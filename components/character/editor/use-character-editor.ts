"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter, type ComputedCharacter } from "@pathforge/rules-pf1e";
import { saveCharacterSheetAction } from "@/lib/actions/characters";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export type CharacterEditorApi = {
  draft: PathForgeCharacterV1;
  computed: ComputedCharacter;
  status: SaveStatus;
  error: string | null;
  canUndo: boolean;
  update: (mutate: (draft: PathForgeCharacterV1) => void) => void;
  undo: () => void;
};

const MAX_UNDO = 50;

/**
 * Client draft model for the edit workspace (§22). Holds the working character,
 * recomputes derived stats live, debounces autosave through the server action,
 * keeps a local undo stack, and warns before navigating away with unsaved work.
 */
export function useCharacterEditor(
  characterId: string,
  initial: PathForgeCharacterV1,
): CharacterEditorApi {
  const [draft, setDraft] = useState<PathForgeCharacterV1>(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const undoStack = useRef<PathForgeCharacterV1[]>([]);
  const lastSaved = useRef<string>(JSON.stringify(initial));

  const computed: ComputedCharacter = useMemo(() => computeCharacter(draft), [draft]);

  const update = useCallback((mutate: (draft: PathForgeCharacterV1) => void) => {
    setDraft((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
      const next = structuredClone(prev);
      mutate(next);
      return next;
    });
    setCanUndo(true);
    setStatus("unsaved");
  }, []);

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    if (!last) return;
    setDraft(last);
    setCanUndo(undoStack.current.length > 0);
    setStatus("unsaved");
  }, []);

  // Debounced autosave. All status transitions happen inside the async callback
  // so nothing sets state synchronously within the effect body.
  useEffect(() => {
    if (status !== "unsaved") return;
    const timer = setTimeout(async () => {
      const serialized = JSON.stringify(draft);
      if (serialized === lastSaved.current) {
        setStatus("saved");
        return;
      }
      setStatus("saving");
      const res = await saveCharacterSheetAction(characterId, draft);
      if (res.ok) {
        lastSaved.current = serialized;
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(res.error ?? "Could not save.");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, status, characterId]);

  // Guard against losing unsaved edits on navigation/refresh.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === "unsaved" || status === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  return { draft, computed, status, error, canUndo, update, undo };
}
