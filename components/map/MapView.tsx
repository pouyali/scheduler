"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  popupHtml?: string;
};

type Props = {
  pins: MapPin[];
  initialCenter?: [number, number]; // [lng, lat]
  initialZoom?: number;
  draggable?: boolean; // draggable single pin mode — uses pins[0]
  cluster?: boolean;
  onPinDrag?: (lat: number, lng: number) => void;
  onPinClick?: (pinId: string) => void;
  className?: string;
};

export function MapView({
  pins,
  initialCenter,
  initialZoom,
  draggable = false,
  cluster = false,
  onPinDrag,
  onPinClick,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const singleMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const clickHandlerRef = useRef<((e: mapboxgl.MapLayerMouseEvent) => void) | null>(null);

  // Keep latest callbacks accessible without re-attaching listeners.
  const onPinDragRef = useRef(onPinDrag);
  const onPinClickRef = useRef(onPinClick);
  useEffect(() => {
    onPinDragRef.current = onPinDrag;
  }, [onPinDrag]);
  useEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not set");
      return;
    }
    mapboxgl.accessToken = token;
    const firstPin = pins[0];
    const center: [number, number] =
      initialCenter ??
      (firstPin ? [firstPin.lng, firstPin.lat] : [-123.1216, 49.2827]); // Vancouver fallback
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: initialZoom ?? (firstPin ? 13 : 4),
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draggable single-pin mode. Tears down the marker when draggable flips off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draggable) {
      singleMarkerRef.current?.remove();
      singleMarkerRef.current = null;
      return;
    }
    const pin = pins[0];
    if (!pin) {
      singleMarkerRef.current?.remove();
      singleMarkerRef.current = null;
      return;
    }
    if (!singleMarkerRef.current) {
      const marker = new mapboxgl.Marker({ draggable: true })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onPinDragRef.current?.(lat, lng);
      });
      singleMarkerRef.current = marker;
    } else {
      singleMarkerRef.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pins, draggable]);

  // Multi-pin cluster mode. Bails and tears down if draggable is true.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const teardown = () => {
      if (clickHandlerRef.current) {
        map.off("click", "unclustered-point", clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
      if (map.getLayer("clusters")) map.removeLayer("clusters");
      if (map.getLayer("cluster-count")) map.removeLayer("cluster-count");
      if (map.getLayer("unclustered-point")) map.removeLayer("unclustered-point");
      if (map.getSource("seniors")) map.removeSource("seniors");
    };

    if (draggable) {
      teardown();
      return;
    }

    const apply = () => {
      teardown();

      const geojson = {
        type: "FeatureCollection" as const,
        features: pins.map((p) => ({
          type: "Feature" as const,
          properties: { id: p.id, popupHtml: p.popupHtml ?? "" },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
      };

      map.addSource("seniors", {
        type: "geojson",
        data: geojson,
        cluster,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      if (cluster) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "seniors",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0ea5e9",
            "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 25, 25],
            "circle-opacity": 0.8,
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "seniors",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
        });
      }

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "seniors",
        filter: cluster ? ["!", ["has", "point_count"]] : ["all"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      const handler = (e: mapboxgl.MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat || !feat.properties) return;
        const { id, popupHtml } = feat.properties as { id: string; popupHtml: string };
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        if (popupHtml) {
          new mapboxgl.Popup().setLngLat(coords).setHTML(popupHtml).addTo(map);
        }
        onPinClickRef.current?.(id);
      };
      clickHandlerRef.current = handler;
      map.on("click", "unclustered-point", handler);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    return () => {
      if (clickHandlerRef.current) {
        map.off("click", "unclustered-point", clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
    };
  }, [pins, cluster, draggable]);

  return <div ref={containerRef} className={className ?? "h-96 w-full rounded-md border"} />;
}
