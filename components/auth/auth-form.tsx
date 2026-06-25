"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, signInWithOAuthAction, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function AuthForm({
  mode,
  next,
  initialError,
}: {
  mode: "signin" | "signup";
  next?: string;
  initialError?: string;
}) {
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {
    error: initialError,
  });

  const isSignup = mode === "signup";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {isSignup ? "Create your account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {isSignup
            ? "Start forging Pathfinder 1e characters in minutes."
            : "Sign in to your PathForge command center."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <form action={signInWithOAuthAction.bind(null, "google")}>
            <Button type="submit" variant="secondary" className="w-full" size="sm">
              Google
            </Button>
          </form>
          <form action={signInWithOAuthAction.bind(null, "discord")}>
            <Button type="submit" variant="secondary" className="w-full" size="sm">
              Discord
            </Button>
          </form>
        </div>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <form action={formAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}

          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" autoComplete="nickname" placeholder="Seraphina" />
            </div>
          )}

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

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder="••••••••"
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
            {pending ? "Working…" : isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-rune hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to PathForge?{" "}
              <Link href="/signup" className="font-medium text-rune hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
