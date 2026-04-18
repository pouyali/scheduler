"use client";

import { useActionState } from "react";
import { loginAction, loginWithGoogleAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h2 mb-2 text-foreground">Welcome back</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Log in to manage seniors, volunteers, and requests.
        </p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {state?.error ? (
            <p className="text-sm italic text-muted-foreground">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <form action={loginWithGoogleAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <a href="/signup" className="text-foreground underline underline-offset-2">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
