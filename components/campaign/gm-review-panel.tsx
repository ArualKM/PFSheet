"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquarePlus, StickyNote, Copy, ShieldCheck } from "lucide-react";
import {
  submitReviewAction,
  createGmNoteAction,
  createCommentAction,
  duplicateToSandboxAction,
  type SubmitReviewInput,
} from "@/lib/actions/gm-review";
import { REVIEW_CHECKLIST } from "@/lib/character/review-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const textareaClass =
  "flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

type Decision = SubmitReviewInput["decision"];

export function GmReviewPanel({
  campaignId,
  characterId,
  initialChecklist,
  currentStatus,
}: {
  campaignId: string;
  characterId: string;
  initialChecklist: Record<string, boolean>;
  currentStatus: string;
}) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialChecklist);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // GM note composer
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState("gm_only");

  // Change request composer
  const [reqPath, setReqPath] = useState("");
  const [reqBody, setReqBody] = useState("");

  const toggle = (key: string) => setChecklist((c) => ({ ...c, [key]: !c[key] }));

  const submit = (decision: Decision) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await submitReviewAction({ campaignId, characterId, decision, checklist, summary });
      if (res.error) setError(res.error);
      else {
        setDone("Review recorded.");
        router.refresh();
      }
    });
  };

  const addNote = () => {
    setError(null);
    startTransition(async () => {
      const res = await createGmNoteAction(campaignId, characterId, noteBody, noteVisibility);
      if (res.error) setError(res.error);
      else {
        setNoteBody("");
        router.refresh();
      }
    });
  };

  const requestChange = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCommentAction({ campaignId, characterId, targetPath: reqPath, body: reqBody });
      if (res.error) setError(res.error);
      else {
        setReqPath("");
        setReqBody("");
        router.refresh();
      }
    });
  };

  const duplicate = () => {
    setError(null);
    startTransition(async () => {
      const res = await duplicateToSandboxAction(campaignId, characterId);
      // Success redirects; only an error returns here.
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-gold" /> Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Checklist */}
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium text-foreground">Audit checklist</legend>
            {REVIEW_CHECKLIST.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(checklist[item.key])}
                  onChange={() => toggle(item.key)}
                  className="size-4 rounded border-border accent-gold"
                />
                {item.label}
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="review-summary" className="text-sm font-medium text-foreground">
              Summary / notes to the player
            </label>
            <textarea
              id="review-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What you checked, and anything the player should know."
              className={textareaClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => submit("approved")} disabled={pending} className="bg-success text-background hover:bg-success/90">
              <Check className="size-4" /> Approve
            </Button>
            <Button type="button" variant="secondary" onClick={() => submit("approved_with_notes")} disabled={pending}>
              Approve w/ notes
            </Button>
            <Button type="button" variant="secondary" onClick={() => submit("changes_requested")} disabled={pending}>
              Request changes
            </Button>
            <Button type="button" variant="secondary" onClick={() => submit("in_review")} disabled={pending}>
              Mark in review
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => submit("rejected")}
            disabled={pending}
            className="text-danger hover:bg-danger/10"
          >
            Reject for this campaign
          </Button>

          <p className="text-xs text-muted-foreground">Current status: {currentStatus.replaceAll("_", " ")}</p>
          {done && <p className="text-sm text-success">{done}</p>}
        </CardContent>
      </Card>

      {/* Change request */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="size-4 text-gold" /> Request a change
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={reqPath} onChange={(e) => setReqPath(e.target.value)} placeholder="Field (optional), e.g. abilities.str" className="h-9" />
          <textarea
            rows={2}
            value={reqBody}
            onChange={(e) => setReqBody(e.target.value)}
            placeholder="What should the player change?"
            className={textareaClass}
          />
          <Button type="button" size="sm" variant="secondary" onClick={requestChange} disabled={pending || !reqBody.trim()}>
            Send to player
          </Button>
          <p className="text-xs text-muted-foreground">Visible to the player on their sheet.</p>
        </CardContent>
      </Card>

      {/* GM note */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="size-4 text-gold" /> Add a note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            rows={2}
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="A note for yourself, the player, or the party."
            className={textareaClass}
          />
          <div className="flex items-center gap-2">
            <label htmlFor="note-visibility" className="sr-only">
              Note visibility
            </label>
            <select
              id="note-visibility"
              value={noteVisibility}
              onChange={(e) => setNoteVisibility(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="gm_only">GM only</option>
              <option value="player_visible">Player visible</option>
              <option value="party_visible">Party visible</option>
            </select>
            <Button type="button" size="sm" variant="secondary" onClick={addNote} disabled={pending || !noteBody.trim()}>
              Add note
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button type="button" variant="ghost" size="sm" onClick={duplicate} disabled={pending} className="w-full justify-center">
        <Copy className="size-4" /> Duplicate to private sandbox
      </Button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
