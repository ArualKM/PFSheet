"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignCreateForm } from "./campaign-create-form";

/** Page header for /campaigns. Owns the create-form open state so the form renders full-width BELOW
 * the header instead of being squeezed into the header's actions slot (mirrors PageHeader's markup). */
export function CampaignsHeader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Campaigns
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Group characters into a table, review sheets as a GM, and keep the party in sync.
          </p>
        </div>
        {!open && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New campaign
            </Button>
          </div>
        )}
      </div>
      {open && <CampaignCreateForm onClose={() => setOpen(false)} />}
    </>
  );
}
