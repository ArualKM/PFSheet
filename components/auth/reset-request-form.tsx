"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetRequestForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>Enter your email and we&rsquo;ll send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p role="status" className="text-sm text-success">
              {state.message}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-rune hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
