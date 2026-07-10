"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type HousingFormProps = {
  onSubmit: (address: string) => void;
  isLoading: boolean;
  disabled: boolean;
  error: string | null;
};

export function HousingForm({ onSubmit, isLoading, disabled, error }: HousingFormProps) {
  const [address, setAddress] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(address);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border px-4 py-4">
      <h2 className="text-sm font-semibold text-foreground">2 · Tester un logement</h2>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Calculez d&apos;abord la zone commune avec vos deux lieux de travail.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="housing">Adresse d&apos;un logement à tester</Label>
        <Input
          id="housing"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Adresse du logement"
          disabled={disabled}
          required
        />
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={disabled || isLoading}>
        {isLoading ? "Test…" : "Tester ce logement"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
