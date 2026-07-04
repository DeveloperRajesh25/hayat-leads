"use client";

import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: LoginState = {};

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card>
      <CardContent className="p-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@hayatinteriors.com"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" loading={pending}>
            {!pending && <LogIn className="h-4 w-4" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
