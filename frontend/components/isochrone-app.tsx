"use client";

import { HousingForm } from "@/components/housing-form";
import { HousingList } from "@/components/housing-list";
import { MapLegend } from "@/components/map/map-legend";
import { Panel } from "@/components/panel";
import { PoiFilters } from "@/components/poi-filters";
import { Welcome } from "@/components/welcome";
import { WorkplaceForm } from "@/components/workplace-form";
import { ApiError, fetchHousing, fetchIsochrone, fetchPois, type Poi, type PoiGroup, type TravelMode } from "@/lib/api";
import { computeIntersection, computeUnion, type PolygonFeature } from "@/lib/geo";
import { buildHousingMarker, removeHousingAt } from "@/lib/housing";
import { poiBbox, poisInZone } from "@/lib/pois";
import { WORKPLACES_STORAGE_KEY, parseSavedWorkplaces } from "@/lib/workplaces";
import type { HousingMarker, WorkResult } from "@/components/map/isochrone-map";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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
  const [focus, setFocus] = useState<{ index: number; token: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = parseSavedWorkplaces(localStorage.getItem(WORKPLACES_STORAGE_KEY));
    return !saved.address1 && !saved.address2;
  });
  const [poiGroups, setPoiGroups] = useState<PoiGroup[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiError, setPoiError] = useState<string | null>(null);

  function handleRemoveHousing(index: number) {
    setHousingMarkers((prev) => removeHousingAt(prev, index));
    setFocus(null);
  }

  function handleFocusHousing(index: number) {
    setFocus({ index, token: Date.now() });
  }

  useEffect(() => {
    if (poiGroups.length === 0 || !intersection) {
      // Reset POI list when filters cleared or zone unavailable; eslint-plugin-react-hooks v6 flags all state-setters in effect regardless of context.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPois([]);
      return;
    }
    let cancelled = false;
    // Clear prior errors before starting new fetch.
    setPoiError(null);
    fetchPois(poiBbox(intersection), poiGroups)
      .then((results) => {
        if (!cancelled) setPois(poisInZone(results, intersection));
      })
      .catch((err) => {
        if (!cancelled) {
          setPoiError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [poiGroups, intersection]);

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
      setShowWelcome(false);
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
        focus={focus}
        pois={pois}
      />

      {work1 && work2 && (
        <div className="absolute top-3 right-3 z-10 md:top-auto md:bottom-8">
          <MapLegend />
        </div>
      )}

      {/* Temporary null — Task 4 wires the real session email here. */}
      <Panel accountEmail={null}>
        {showWelcome && <Welcome />}
        <WorkplaceForm
          onSubmit={handleWorkplaceSubmit}
          isLoading={isLoadingWorkplaces}
          resolved1={resolved1}
          resolved2={resolved2}
          error={workplaceError}
        />
        <PoiFilters
          selected={poiGroups}
          onChange={setPoiGroups}
          disabled={!intersection}
          error={poiError}
        />
        <HousingForm
          onSubmit={handleHousingSubmit}
          isLoading={isLoadingHousing}
          disabled={!work1 || !work2}
          error={housingError}
        />
        <HousingList
          items={housingMarkers}
          onRemove={handleRemoveHousing}
          onFocus={handleFocusHousing}
        />
      </Panel>
    </div>
  );
}
