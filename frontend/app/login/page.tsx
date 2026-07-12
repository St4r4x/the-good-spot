"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/app");
    });
  }, [router]);

  function resetMessages() {
    setError(null);
    setConfirmationSent(false);
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    if (mode === "signin") {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/app");
      return;
    }
    const { data, error } = await supabase!.auth.signUp({ email, password });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setConfirmationSent(true);
    } else {
      router.push("/app");
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  }

  async function handleGoogle() {
    await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
  }

  if (!supabase) return null;

  if (mode === "forgot") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <form onSubmit={handleForgotSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Mot de passe oublié</h1>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "…" : "Envoyer le lien"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              resetMessages();
            }}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Retour à la connexion
          </button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {resetSent && (
            <p role="status" className="text-sm text-muted-foreground">
              Email envoyé : vérifie ta boîte mail pour réinitialiser ton mot de passe.
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          {mode === "signin" ? "Se connecter" : "Créer un compte"}
        </h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Mot de passe</Label>
          <Input
            id="login-password"
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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              resetMessages();
            }}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {mode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                resetMessages();
              }}
              className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {confirmationSent && (
          <p role="status" className="text-sm text-muted-foreground">
            Compte créé : vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.
          </p>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
            Continuer avec Google
          </Button>
        </div>
      </form>
    </div>
  );
}
