"use client";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JourneyIllustration } from "@/components/illustrations/journey";
import { KeyIllustration } from "@/components/illustrations/key";
import { supabase } from "@/lib/supabase/client";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "signin" | "signup" | "forgot";

const CAPTIONS: Record<Mode, string> = {
  signin: "Reprenez votre recherche : la zone qui convient à vos deux trajets vous attend.",
  signup: "Un compte gratuit pour garder vos lieux de travail synchronisés partout.",
  forgot: "Ça arrive à tout le monde — on vous envoie un nouveau lien en un instant.",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  function switchMode(next: Mode) {
    setMode(next);
    setShowPassword(false);
    resetMessages();
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
      <AuthLayout illustration={KeyIllustration} caption={CAPTIONS.forgot}>
        <form onSubmit={handleForgotSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Mot de passe oublié</h1>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
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
            onClick={() => switchMode("signin")}
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
            <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
              Email envoyé : vérifie ta boîte mail pour réinitialiser ton mot de passe.
            </p>
          )}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout illustration={JourneyIllustration} caption={CAPTIONS[mode]}>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          {mode === "signin" ? "Content de vous revoir" : "Créer un compte"}
        </h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Mot de passe</Label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "…" : mode === "signin" ? "Se connecter" : "S'inscrire"}
        </Button>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {mode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
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
          <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            Compte créé : vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
          Continuer avec Google
        </Button>
      </form>
    </AuthLayout>
  );
}
