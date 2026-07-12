"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { Popover } from "@base-ui/react/popover";
import { LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";

type AccountMenuProps = {
  email: string | null;
};

export function AccountMenu({ email }: AccountMenuProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: formEmail, password })
        : await supabase.auth.signUp({ email: formEmail, password });
    setIsLoading(false);
    if (error) setError(error.message);
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  if (email) {
    return (
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
        aria-label={`Se déconnecter (${email})`}
      >
        <LogOut aria-hidden className="size-4" />
        <span className="hidden md:inline">{email}</span>
      </button>
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none">
        <UserIcon aria-hidden className="size-4" />
        Se connecter
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup className="w-64 rounded-lg border border-border bg-card p-4 shadow-floating">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-email">Email</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-password">Mot de passe</Label>
                <Input
                  id="account-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "…" : mode === "signin" ? "Se connecter" : "S'inscrire"}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {mode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
              </button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </form>
            <div className="mt-3 border-t border-border pt-3">
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
                Continuer avec Google
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
