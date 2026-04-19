"use client";

import { useActionState } from "react";
import { signupAction, signupWithGoogleAction, type SignupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h2 mb-2 text-foreground">Sign up as a volunteer</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          After signup, an admin will review your profile and activate your account.
        </p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password (min 8)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {state?.error ? (
            <p className="text-sm italic text-muted-foreground">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <form action={signupWithGoogleAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-foreground underline underline-offset-2">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
