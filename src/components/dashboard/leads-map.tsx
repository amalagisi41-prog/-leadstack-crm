"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Globe2, MapPin } from "lucide-react";
import {
  Map as MapboxMap,
  Layer,
  Popup,
  Source,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSubAccount } from "@/context/sub-account-context";
import { formatCurrency } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";

interface PopupState {
  lat: number;
  lng: number;
  name: string;
  city: string | null;
  country: string | null;
  dealStageId: string | null;
  dealValue: number | null;
  dealCurrency: string | null;
}

const CLUSTER_LAYER = "leads-clusters";
const CLUSTER_COUNT_LAYER = "leads-cluster-count";
const UNCLUSTERED_LAYER = "leads-unclustered";

export function LeadsMap({
  contacts,
  deals,
}: {
  contacts: Contact[];
  deals: Deal[];
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const { resolvedTheme } = useTheme();
  const { saPath } = useSubAccount();
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);

  // Build a contactId -> best-available deal lookup. Prefer open deals
  // (most recent first); fall back to the most recent closed deal. This
  // mirrors what's useful at a glance on a lead map: "is there active
  // work on this lead, and at what stage."
  const dealByContact = useMemo(() => {
    const map = new Map<string, Deal>();
    const TERMINAL = new Set(["won", "lost"]);
    // Sort once: open deals first, then by most recent stageChangedAt
    const sorted = [...deals].sort((a, b) => {
      const aOpen = !TERMINAL.has(a.stageId);
      const bOpen = !TERMINAL.has(b.stageId);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return 0;
    });
    for (const d of sorted) {
      if (!map.has(d.contactId)) map.set(d.contactId, d);
    }
    return map;
  }, [deals]);

  const located = useMemo(
    () =>
      contacts.filter(
        (c) =>
          typeof c.lat === "number" &&
          typeof c.lng === "number" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      ),
    [contacts],
  );

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: located.map((c) => {
        const deal = dealByContact.get(c.id) ?? null;
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [c.lng as number, c.lat as number],
          },
          properties: {
            contactId: c.id,
            name: c.name || "Unnamed",
            city: c.city ?? null,
            country: c.country ?? null,
            dealStageId: deal?.stageId ?? null,
            dealValue: deal?.value ?? null,
            dealCurrency: deal?.currency ?? null,
          },
        };
      }),
    }),
    [located, dealByContact],
  );

  // Imperative hover + cursor handling. react-map-gl's declarative event
  // props fire too noisily for this; mapbox's per-layer mouseenter/leave
  // is exactly what we want. Wired on map load so the ref is ready.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    const onPinEnter = (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const p = feature.properties ?? {};
      setPopup({
        lng,
        lat,
        name: String(p.name ?? "Unnamed"),
        city: p.city ? String(p.city) : null,
        country: p.country ? String(p.country) : null,
        dealStageId: p.dealStageId ? String(p.dealStageId) : null,
        dealValue: typeof p.dealValue === "number" ? p.dealValue : null,
        dealCurrency: p.dealCurrency ? String(p.dealCurrency) : null,
      });
      setPointer();
    };
    const onPinLeave = () => {
      setPopup(null);
      clearPointer();
    };

    map.on("mouseenter", UNCLUSTERED_LAYER, onPinEnter);
    map.on("mouseleave", UNCLUSTERED_LAYER, onPinLeave);
    map.on("mouseenter", CLUSTER_LAYER, setPointer);
    map.on("mouseleave", CLUSTER_LAYER, clearPointer);

    return () => {
      map.off("mouseenter", UNCLUSTERED_LAYER, onPinEnter);
      map.off("mouseleave", UNCLUSTERED_LAYER, onPinLeave);
      map.off("mouseenter", CLUSTER_LAYER, setPointer);
      map.off("mouseleave", CLUSTER_LAYER, clearPointer);
    };
    // Re-bind only when the underlying map instance changes (i.e., on
    // theme-driven style swaps the map remounts via reuseMaps=false).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, located.length > 0]);

  // Missing token — render a configuration nudge instead of the map.
  if (!token) {
    return (
      <Card>
        <Header
          title="Where your leads are"
          subtitle="Map unavailable — Mapbox not configured"
        />
        <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
          <div className="max-w-md space-y-2">
            <Globe2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p>
              Add{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                NEXT_PUBLIC_MAPBOX_TOKEN
              </code>{" "}
              to <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>{" "}
              to render the map. See CLAUDE.md for setup.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // No contacts have location yet — friendly empty state, same dimensions.
  if (located.length === 0) {
    return (
      <Card>
        <Header
          title="Where your leads are"
          subtitle="Pins appear as leads come in via your forms"
        />
        <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
          <div className="max-w-md space-y-2">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p>
              Locations are captured from the visitor&apos;s IP at form submit,
              with phone country-code as a fallback. Existing contacts created
              before this shipped won&apos;t show on the map.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const styleUrl =
    resolvedTheme === "dark"
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";

  function handleClick(e: MapMouseEvent) {
    const feature = e.features?.[0];
    if (!feature || !feature.properties) return;

    const coords =
      feature.geometry.type === "Point"
        ? (feature.geometry.coordinates as [number, number])
        : null;
    if (!coords) return;

    if (feature.properties.cluster) {
      // Cluster click — zoom in two steps.
      const currentZoom = mapRef.current?.getZoom() ?? 2;
      mapRef.current?.flyTo({
        center: coords,
        zoom: Math.min(currentZoom + 2, 14),
        duration: 500,
      });
      return;
    }

    // Pin click — navigate to pipeline. The hover popup gives at-a-glance
    // status; clicking jumps to where the deal lives.
    router.push(saPath("/pipeline"));
  }

  const subtitle =
    `${located.length} of ${contacts.length} contacts pinned · hover for status, click to open pipeline`;

  return (
    <Card>
      <Header title="Where your leads are" subtitle={subtitle} />
      <div className="aspect-[16/9] overflow-hidden rounded-lg border">
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{ longitude: 10, latitude: 25, zoom: 1.4 }}
          mapStyle={styleUrl}
          interactiveLayerIds={[CLUSTER_LAYER, UNCLUSTERED_LAYER]}
          onClick={handleClick}
          reuseMaps
        >
          <Source
            id="leads"
            type="geojson"
            data={geojson}
            cluster
            clusterRadius={50}
            clusterMaxZoom={12}
          >
            <Layer
              id={CLUSTER_LAYER}
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "step",
                  ["get", "point_count"],
                  "#6366f1",
                  10,
                  "#8b5cf6",
                  50,
                  "#ec4899",
                ],
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  16,
                  10,
                  22,
                  50,
                  28,
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "rgba(255,255,255,0.9)",
              }}
            />
            <Layer
              id={CLUSTER_COUNT_LAYER}
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 12,
                "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              }}
              paint={{ "text-color": "#ffffff" }}
            />
            <Layer
              id={UNCLUSTERED_LAYER}
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": "#10b981",
                "circle-radius": 7,
                "circle-stroke-width": 2,
                "circle-stroke-color": "rgba(255,255,255,0.95)",
              }}
            />
          </Source>

          {popup && <ContactPopup popup={popup} />}
        </MapboxMap>
      </div>
    </Card>
  );
}

function ContactPopup({ popup }: { popup: PopupState }) {
  const place =
    [popup.city, popup.country].filter(Boolean).join(", ") ||
    "Location unknown";
  const hasDeal = !!popup.dealStageId;
  const stage = hasDeal ? getStage(popup.dealStageId) : null;
  const valueLabel =
    popup.dealValue != null
      ? formatCurrency(popup.dealValue, popup.dealCurrency ?? "USD")
      : null;

  return (
    <Popup
      longitude={popup.lng}
      latitude={popup.lat}
      anchor="bottom"
      closeButton={false}
      closeOnClick={false}
      offset={12}
    >
      <div className="space-y-1 text-xs">
        <p className="font-semibold text-foreground">{popup.name}</p>
        <p className="text-muted-foreground">{place}</p>
        {stage ? (
          <div className="mt-1 flex items-center gap-2 border-t pt-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stage.tone}`}
            >
              {stage.label}
            </span>
            {valueLabel && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {valueLabel}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 border-t pt-1.5 text-[11px] italic text-muted-foreground">
            No active deal
          </p>
        )}
      </div>
    </Popup>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5">{children}</section>;
}

function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
        <Globe2 className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
