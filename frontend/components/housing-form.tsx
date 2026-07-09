"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type HousingFormProps = {
  onSubmit: (address: string) => void;
  isLoading: boolean;
  disabled: boolean;
};

export function HousingForm({ onSubmit, isLoading, disabled }: HousingFormProps) {
  const [address, setAddress] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(address);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 px-4 pb-4">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
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
      <Button type="submit" variant="secondary" disabled={disabled || isLoading}>
        {isLoading ? "Test…" : "Tester ce logement"}
      </Button>
    </form>
  );
}
