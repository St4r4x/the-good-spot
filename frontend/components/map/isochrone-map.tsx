"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { PolygonFeature } from "@/lib/geo";

export type WorkResult = {
  lat: number;
  lon: number;
  polygon: PolygonFeature;
};

export type HousingMarker = {
  lat: number;
  lon: number;
  inZone: boolean;
  resolvedAddress: string;
  timeToWork1Minutes: number;
  timeToWork2Minutes: number;
};

type IsochroneMapProps = {
  work1: WorkResult | null;
  work2: WorkResult | null;
  intersection: PolygonFeature | null;
  housingMarkers: HousingMarker[];
};

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522];

L.Icon.Default.mergeOptions({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

export function IsochroneMap({
  work1,
  work2,
  intersection,
  housingMarkers,
}: IsochroneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

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

    if (!work1 || !work2) return;

    const zone1 = L.geoJSON(work1.polygon, {
      style: { color: "#0d7373", weight: 1.5, fillOpacity: 0.08 },
    }).addTo(map);
    const zone2 = L.geoJSON(work2.polygon, {
      style: { color: "#3f7d3f", weight: 1.5, fillOpacity: 0.08 },
    }).addTo(map);
    const marker1 = L.marker([work1.lat, work1.lon]).addTo(map).bindPopup("Lieu de travail 1");
    const marker2 = L.marker([work2.lat, work2.lon]).addTo(map).bindPopup("Lieu de travail 2");
    layersRef.current.push(zone1, zone2, marker1, marker2);

    let bounds = zone1.getBounds().extend(zone2.getBounds());

    if (intersection) {
      const intersectionLayer = L.geoJSON(intersection, {
        style: { color: "#b3452e", weight: 2.5, fillOpacity: 0.3 },
      }).addTo(map);
      layersRef.current.push(intersectionLayer);
    }

    housingMarkers.forEach((h) => {
      const marker = L.circleMarker([h.lat, h.lon], {
        radius: 9,
        color: h.inZone ? "#0d7373" : "#8a8f8f",
        fillColor: h.inZone ? "#38b28a" : "#b8bcbc",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `${h.resolvedAddress}<br>` +
            `${h.inZone ? "✅ dans la zone" : "⚠️ hors zone"}<br>` +
            `Trajet lieu 1 : ${h.timeToWork1Minutes} min<br>` +
            `Trajet lieu 2 : ${h.timeToWork2Minutes} min`
        );
      layersRef.current.push(marker);
      bounds = bounds.extend([h.lat, h.lon]);
    });

    map.fitBounds(bounds, { padding: [24, 24] });
  }, [work1, work2, intersection, housingMarkers]);

  return <div ref={containerRef} className="absolute inset-0 isolate" />;
}
