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
import { supabase } from "@/lib/supabase/client";
import {
  housingSearchRowToMarker,
  markerToHousingSearchInsert,
  savedToWorkplacesUpsert,
  workplacesRowToSaved,
  type HousingSearchRow,
  type SavedWorkplaces,
} from "@/lib/sync";
import type { HousingMarker, WorkResult } from "@/components/map/isochrone-map";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const IsochroneMap = dynamic(
  () => import("@/components/map/isochrone-map").then((m) => m.IsochroneMap),
  { ssr: false }
);

export function IsochroneApp() {
  const router = useRouter();
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
  const [showWelcome, setShowWelcome] = useState(false);
  const [poiGroups, setPoiGroups] = useState<PoiGroup[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [initialWorkplaces, setInitialWorkplaces] = useState<SavedWorkplaces | undefined>(
    undefined
  );

  function handleRemoveHousing(index: number) {
    const removed = housingMarkers[index];
    setHousingMarkers((prev) => removeHousingAt(prev, index));
    setFocus(null);
    if (removed?.id) {
      supabase!.from("housing_searches").delete().eq("id", removed.id);
    }
  }

  function handleFocusHousing(index: number) {
    setFocus({ index, token: Date.now() });
  }

  useEffect(() => {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    let cancelled = false;

    async function hydrate(userId: string) {
      const [{ data: workplacesRow }, { data: housingRows }] = await Promise.all([
        supabase!.from("workplaces").select("*").eq("user_id", userId).maybeSingle(),
        supabase!
          .from("housing_searches")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (workplacesRow) {
        setInitialWorkplaces(workplacesRowToSaved(workplacesRow));
      } else {
        setShowWelcome(true);
      }
      if (housingRows) {
        setHousingMarkers((housingRows as HousingSearchRow[]).map(housingSearchRowToMarker));
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user.email) {
        router.replace("/login");
        return;
      }
      setUser({ id: session.user.id, email: session.user.email });
      hydrate(session.user.id).finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

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
      await supabase!
        .from("workplaces")
        .upsert(
          savedToWorkplacesUpsert(
            { address1, address2, minutes: String(minutes), modes: selectedModes },
            user!.id
          )
        );
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
      const marker = buildHousingMarker(results, intersection);
      const { data } = await supabase!
        .from("housing_searches")
        .insert(markerToHousingSearchInsert(marker, user!.id))
        .select()
        .single();
      setHousingMarkers((prev) => [
        ...prev,
        data ? housingSearchRowToMarker(data as HousingSearchRow) : marker,
      ]);
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

      {authReady && user ? (
        <Panel accountEmail={user.email}>
          {showWelcome && <Welcome />}
          <WorkplaceForm
            onSubmit={handleWorkplaceSubmit}
            isLoading={isLoadingWorkplaces}
            resolved1={resolved1}
            resolved2={resolved2}
            error={workplaceError}
            initialWorkplaces={initialWorkplaces}
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
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center rounded-t-xl bg-card p-6 shadow-floating md:inset-x-auto md:top-4 md:left-4 md:rounded-xl">
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      )}
    </div>
  );
}
