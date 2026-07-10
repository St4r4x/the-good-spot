"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { PolygonFeature } from "@/lib/geo";
import { MAP_COLORS } from "@/lib/map-colors";
export type { HousingMarker } from "@/lib/housing";
import type { HousingMarker } from "@/lib/housing";

export type WorkResult = {
  lat: number;
  lon: number;
  polygon: PolygonFeature;
};

type IsochroneMapProps = {
  work1: WorkResult | null;
  work2: WorkResult | null;
  intersection: PolygonFeature | null;
  housingMarkers: HousingMarker[];
  focus: { index: number; token: number } | null;
};

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522];

L.Icon.Default.mergeOptions({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

export function IsochroneMap({
  work1,
  work2,
  intersection,
  housingMarkers,
  focus,
}: IsochroneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const housingLayersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];
    housingLayersRef.current = [];

    if (!work1 || !work2) return;

    const zone1 = L.geoJSON(work1.polygon, {
      style: { color: MAP_COLORS.zone1, weight: 1.5, fillOpacity: 0.08 },
    }).addTo(map);
    const zone2 = L.geoJSON(work2.polygon, {
      style: { color: MAP_COLORS.zone2, weight: 1.5, fillOpacity: 0.08 },
    }).addTo(map);
    const marker1 = L.marker([work1.lat, work1.lon]).addTo(map).bindPopup("Lieu de travail 1");
    const marker2 = L.marker([work2.lat, work2.lon]).addTo(map).bindPopup("Lieu de travail 2");
    layersRef.current.push(zone1, zone2, marker1, marker2);

    let bounds = zone1.getBounds().extend(zone2.getBounds());

    if (intersection) {
      const intersectionLayer = L.geoJSON(intersection, {
        style: { color: MAP_COLORS.intersection, weight: 2.5, fillOpacity: 0.3 },
      }).addTo(map);
      layersRef.current.push(intersectionLayer);
    }

    housingMarkers.forEach((h) => {
      const marker = L.circleMarker([h.lat, h.lon], {
        radius: 9,
        color: h.inZone ? MAP_COLORS.zone1 : "#8a8f8f",
        fillColor: h.inZone ? MAP_COLORS.housingIn : MAP_COLORS.housingOut,
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `<strong>${escapeHtml(h.resolvedAddress)}</strong><br>` +
            `<span style="color:${h.inZone ? MAP_COLORS.zone1 : "#8a5230"};font-weight:600">` +
            `${h.inZone ? "Dans la zone" : "Hors zone"}</span><br>` +
            `Trajet lieu 1 : ${h.timeToWork1Minutes} min<br>` +
            `Trajet lieu 2 : ${h.timeToWork2Minutes} min`
        );
      layersRef.current.push(marker);
      housingLayersRef.current.push(marker);
      bounds = bounds.extend([h.lat, h.lon]);
    });

    map.fitBounds(bounds, { padding: [24, 24] });
  }, [work1, work2, intersection, housingMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const layer = housingLayersRef.current[focus.index];
    if (!layer) return;
    map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 13));
    layer.openPopup();
  }, [focus]);

  return <div ref={containerRef} className="absolute inset-0 isolate" />;
}
