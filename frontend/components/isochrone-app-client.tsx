"use client";

import dynamic from "next/dynamic";

export const IsochroneAppClient = dynamic(
  () => import("@/components/isochrone-app").then((m) => m.IsochroneApp),
  { ssr: false }
);
