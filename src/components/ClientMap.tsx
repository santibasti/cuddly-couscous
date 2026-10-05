// Philippines map with clustered pins (Leaflet + markercluster). Loaded lazily so the rest of the app stays light.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Pin, AreaRow, Stage } from '@/lib/insights';
import { PH_CENTER } from '@/lib/geo-ph';

export const STAGE_COLOR: Record<Stage, string> = { Lead: '#9db0c5', Quoted: '#B7791F', Booked: '#0E9AA7', Completed: '#0B2545' };
const dot = (c: string, n?: number) => L.divIcon({ className: 'pin-wrap', html: `<span class="pin-dot" style="background:${c}">${n ?? ''}</span>`, iconSize: [n ? 30 : 18, n ? 30 : 18] });

interface Props { pins: Pin[]; areas: AreaRow[]; exact: boolean; selectedKey?: string; onSelect: (pins: Pin[]) => void; onArea?: (a: AreaRow) => void }

export default function ClientMap({ pins, areas, exact, selectedKey, onSelect, onArea }: Props) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | undefined>(undefined); const layer = useRef<L.LayerGroup | undefined>(undefined); const cb = useRef({ onSelect, onArea }); cb.current = { onSelect, onArea };
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: PH_CENTER, zoom: 6, minZoom: 5, maxZoom: 18, zoomControl: true, worldCopyJump: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(m);
    map.current = m; const t = setTimeout(() => { if (map.current === m) m.invalidateSize(); }, 150);
    return () => { clearTimeout(t); layer.current = undefined; map.current = undefined; m.remove(); };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    layer.current?.remove();
    const pts: L.LatLng[] = [];
    if (exact) {
      const cluster = L.markerClusterGroup({ showCoverageOnHover: false, zoomToBoundsOnClick: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true, chunkedLoading: true });
      for (const p of pins) {
        const mk = L.marker([p.lat, p.lng], { icon: dot(STAGE_COLOR[p.stage]), title: p.clientName });
        (mk as L.Marker & { pin?: Pin }).pin = p; mk.on('click', () => cb.current.onSelect([p])); cluster.addLayer(mk); pts.push(L.latLng(p.lat, p.lng));
      }
      cluster.on('clusterclick', (e: L.LeafletEvent) => {
        const c = (e as unknown as { layer: L.MarkerCluster }).layer; const kids = c.getAllChildMarkers().map((x) => (x as L.Marker & { pin?: Pin }).pin!).filter(Boolean);
        cb.current.onSelect(kids); const b = c.getBounds(); if (b.isValid() && m.getZoom() < 17 && b.getSouthWest().distanceTo(b.getNorthEast()) > 30) m.fitBounds(b.pad(0.3), { maxZoom: 16 });
      });
      layer.current = cluster; cluster.addTo(m);
    } else {
      // no exact points for this role: one bubble per city, drawn at the city centre
      const g = L.layerGroup();
      for (const a of areas) { const mk = L.marker([a.lat, a.lng], { icon: dot('#0E9AA7', a.clients), title: a.label }); mk.on('click', () => cb.current.onArea?.(a)); g.addLayer(mk); pts.push(L.latLng(a.lat, a.lng)); }
      layer.current = g; g.addTo(m);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 12, animate: false }); else m.setView(PH_CENTER, 6, { animate: false });
  }, [pins, areas, exact]);
  useEffect(() => { void selectedKey; }, [selectedKey]);
  return <div ref={el} className="client-map" role="application" aria-label="Client distribution map" />;
}
