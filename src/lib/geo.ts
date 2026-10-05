import type { Geo } from './actions';

/** One-shot GPS fix (resolves to {} when unavailable or denied). */
export function getGeo(): Promise<Geo> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition((p) => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }), () => res({}), { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 });
  });
}
