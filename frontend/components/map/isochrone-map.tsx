"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PolygonFeature } from "@/lib/geo";
import { MAP_COLORS } from "@/lib/map-colors";
import type { Poi, PoiGroup } from "@/lib/api";
import { POI_GROUP_ICONS, POI_GROUP_LABELS, poiLabel } from "@/lib/pois";
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
  pois: Poi[];
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

function poiDivIcon(group: PoiGroup): L.DivIcon {
  const Icon = POI_GROUP_ICONS[group];
  return L.divIcon({
    className: "poi-marker",
    html: renderToStaticMarkup(<Icon size={14} />),
    iconSize: [26, 26],
  });
}

export function IsochroneMap({
  work1,
  work2,
  intersection,
  housingMarkers,
  focus,
  pois,
}: IsochroneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const housingLayersRef = useRef<L.CircleMarker[]>([]);
  const poiClusterRef = useRef<L.MarkerClusterGroup | null>(null);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (poiClusterRef.current) {
      map.removeLayer(poiClusterRef.current);
      poiClusterRef.current = null;
    }
    if (pois.length === 0) return;

    const cluster = L.markerClusterGroup();
    pois.forEach((poi) => {
      L.marker([poi.lat, poi.lon], { icon: poiDivIcon(poi.group) })
        .bindPopup(
          `<strong>${escapeHtml(poiLabel(poi))}</strong><br>${escapeHtml(POI_GROUP_LABELS[poi.group])}`
        )
        .addTo(cluster);
    });
    cluster.addTo(map);
    poiClusterRef.current = cluster;
  }, [pois]);

  return <div ref={containerRef} className="absolute inset-0 isolate" />;
}
