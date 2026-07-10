"use client";

import { HousingForm } from "@/components/housing-form";
import { Panel } from "@/components/panel";
import { WorkplaceForm } from "@/components/workplace-form";
import { ApiError, fetchHousing, fetchIsochrone, type TravelMode } from "@/lib/api";
import { computeIntersection, computeUnion, type PolygonFeature } from "@/lib/geo";
import { buildHousingMarker } from "@/lib/housing";
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
  const [resolved1, setResolved1] = useState<string | null>(null);
  const [resolved2, setResolved2] = useState<string | null>(null);
  const [workplaceError, setWorkplaceError] = useState<string | null>(null);
  const [housingError, setHousingError] = useState<string | null>(null);
  const [isLoadingWorkplaces, setIsLoadingWorkplaces] = useState(false);
  const [isLoadingHousing, setIsLoadingHousing] = useState(false);

  async function handleWorkplaceSubmit(
    address1: string,
    address2: string,
    minutes: number,
    selectedModes: TravelMode[]
  ) {
    setWorkplaceError(null);
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
      setResolved1(results1[0].resolved_address);
      setResolved2(results2[0].resolved_address);
      setHousingMarkers([]);

      const computed = computeIntersection(polygon1, polygon2);
      setIntersection(computed);
      if (!computed) {
        setWorkplaceError(`Aucune zone commune atteignable en ${minutes} min depuis les deux lieux.`);
      }
    } catch (err) {
      setWorkplaceError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingWorkplaces(false);
    }
  }

  async function handleHousingSubmit(address: string) {
    if (!work1 || !work2) {
      setHousingError("Calcule d'abord la zone commune avec les deux lieux de travail.");
      return;
    }
    setHousingError(null);
    setIsLoadingHousing(true);
    try {
      const results = await Promise.all(
        modes.map((m) => fetchHousing(address, work1, work2, m))
      );
      setHousingMarkers((prev) => [...prev, buildHousingMarker(results, intersection)]);
    } catch (err) {
      setHousingError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingHousing(false);
    }
  }

  return (
    <div className="relative h-full">
      <IsochroneMap
        work1={work1}
        work2={work2}
        intersection={intersection}
        housingMarkers={housingMarkers}
      />

      <Panel>
        <WorkplaceForm
          onSubmit={handleWorkplaceSubmit}
          isLoading={isLoadingWorkplaces}
          resolved1={resolved1}
          resolved2={resolved2}
          error={workplaceError}
        />
        <HousingForm
          onSubmit={handleHousingSubmit}
          isLoading={isLoadingHousing}
          disabled={!work1 || !work2}
        />
        {housingError && (
          <p role="alert" className="px-4 pb-4 text-sm text-destructive">
            {housingError}
          </p>
        )}
      </Panel>
    </div>
  );
}
