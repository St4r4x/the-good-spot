"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HousingForm } from "@/components/housing-form";
import { WorkplaceForm } from "@/components/workplace-form";
import { ApiError, fetchHousing, fetchIsochrone, type TravelMode } from "@/lib/api";
import { computeIntersection, computeUnion, isPointInPolygon, type PolygonFeature } from "@/lib/geo";
import type { HousingMarker, WorkResult } from "@/components/map/isochrone-map";
import dynamic from "next/dynamic";
import { useState } from "react";

const IsochroneMap = dynamic(
  () => import("@/components/map/isochrone-map").then((m) => m.IsochroneMap),
  { ssr: false }
);

export function IsochroneApp() {
  const [work1, setWork1] = useState<WorkResult | null>(null);
  const [work2, setWork2] = useState<WorkResult | null>(null);
  const [modes, setModes] = useState<TravelMode[]>(["transit"]);
  const [intersection, setIntersection] = useState<PolygonFeature | null>(null);
  const [housingMarkers, setHousingMarkers] = useState<HousingMarker[]>([]);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingWorkplaces, setIsLoadingWorkplaces] = useState(false);
  const [isLoadingHousing, setIsLoadingHousing] = useState(false);

  async function handleWorkplaceSubmit(
    address1: string,
    address2: string,
    minutes: number,
    selectedModes: TravelMode[]
  ) {
    setError(null);
    setIsLoadingWorkplaces(true);
    setModes(selectedModes);
    try {
      const [results1, results2] = await Promise.all([
        Promise.all(selectedModes.map((m) => fetchIsochrone(address1, minutes, m))),
        Promise.all(selectedModes.map((m) => fetchIsochrone(address2, minutes, m))),
      ]);

      const polygon1 = computeUnion(results1.map((r) => r.isochrone.features[0]));
      const polygon2 = computeUnion(results2.map((r) => r.isochrone.features[0]));

      setWork1({ lat: results1[0].lat, lon: results1[0].lon, polygon: polygon1 });
      setWork2({ lat: results2[0].lat, lon: results2[0].lon, polygon: polygon2 });
      setResolvedLabel(
        `Lieu 1 : ${results1[0].resolved_address} — Lieu 2 : ${results2[0].resolved_address}`
      );
      setHousingMarkers([]);

      const computed = computeIntersection(polygon1, polygon2);
      setIntersection(computed);
      if (!computed) {
        setError(`Aucune zone commune atteignable en ${minutes} min depuis les deux lieux.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingWorkplaces(false);
    }
  }

  async function handleHousingSubmit(address: string) {
    if (!work1 || !work2) {
      setError("Calcule d'abord la zone commune avec les deux lieux de travail.");
      return;
    }
    setError(null);
    setIsLoadingHousing(true);
    try {
      const results = await Promise.all(
        modes.map((m) => fetchHousing(address, work1, work2, m))
      );
      const best = results[0];
      const bestTimeToWork1 = Math.min(...results.map((r) => r.time_to_work1_minutes));
      const bestTimeToWork2 = Math.min(...results.map((r) => r.time_to_work2_minutes));
      const inZone = intersection
        ? isPointInPolygon([best.lon, best.lat], intersection)
        : false;
      setHousingMarkers((prev) => [
        ...prev,
        {
          lat: best.lat,
          lon: best.lon,
          inZone,
          resolvedAddress: best.resolved_address,
          timeToWork1Minutes: bestTimeToWork1,
          timeToWork2Minutes: bestTimeToWork2,
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingHousing(false);
    }
  }

  return (
    <div className="relative flex-1">
      <IsochroneMap
        work1={work1}
        work2={work2}
        intersection={intersection}
        housingMarkers={housingMarkers}
      />

      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <Card className="border-border/60 shadow-md">
          <WorkplaceForm onSubmit={handleWorkplaceSubmit} isLoading={isLoadingWorkplaces} />
          <HousingForm
            onSubmit={handleHousingSubmit}
            isLoading={isLoadingHousing}
            disabled={!work1 || !work2}
          />
        </Card>

        {resolvedLabel && (
          <Card className="border-border/60 w-fit bg-card/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {resolvedLabel}
          </Card>
        )}

        {error && (
          <Badge variant="destructive" className="w-fit px-3 py-1.5 text-sm shadow-sm">
            {error}
          </Badge>
        )}
      </div>
    </div>
  );
}
