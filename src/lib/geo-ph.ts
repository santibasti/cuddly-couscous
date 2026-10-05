// Philippine place finder used to place a service address on the map without a network lookup (and as the fallback when the geocoder is unreachable).
// It matches the city / municipality / well-known district in the address text and returns that place's centre — a city-level (approximate) position.
// A street-level position is added later by the geocoder (or typed in by Admin) and then replaces this one.
import type { GeoFields } from './types';

type Row = [aliases: string[], city: string, province: string, lat: number, lng: number, kind?: 'area' | 'province'];
const NCR = 'Metro Manila';
const PLACES: Row[] = [
  // Metro Manila
  [['manila', 'city of manila', 'ermita', 'malate', 'intramuros', 'binondo', 'tondo', 'sampaloc', 'sta mesa'], 'Manila', NCR, 14.5995, 120.9842],
  [['quezon city', 'qc', 'cubao', 'araneta', 'katipunan', 'commonwealth', 'diliman', 'novaliches', 'fairview', 'tomas morato', 'kamuning'], 'Quezon City', NCR, 14.6760, 121.0437],
  [['caloocan', 'monumento'], 'Caloocan', NCR, 14.6500, 120.9667], [['las pinas', 'las pinas city', 'bf resort'], 'Las Piñas', NCR, 14.4445, 120.9939],
  [['makati', 'makati city', 'ayala ave', 'ayala avenue', 'salcedo', 'legazpi village', 'rockwell', 'poblacion makati'], 'Makati', NCR, 14.5547, 121.0244],
  [['malabon'], 'Malabon', NCR, 14.6625, 120.9567], [['mandaluyong', 'shaw blvd', 'shaw boulevard', 'boni'], 'Mandaluyong', NCR, 14.5794, 121.0359],
  [['marikina', 'marikina city'], 'Marikina', NCR, 14.6507, 121.1029],
  [['muntinlupa', 'muntinlupa city', 'alabang', 'filinvest corporate city', 'ayala alabang', 'bf homes muntinlupa'], 'Muntinlupa', NCR, 14.4081, 121.0415],
  [['navotas'], 'Navotas', NCR, 14.6667, 120.9417],
  [['paranaque', 'paranaque city', 'bf homes', 'moonwalk', 'sucat', 'baclaran', 'sm bicutan'], 'Parañaque', NCR, 14.4793, 121.0198],
  [['pasay', 'pasay city', 'roxas blvd', 'roxas boulevard', 'macapagal', 'mall of asia', 'moa complex', 'aseana', 'naia'], 'Pasay', NCR, 14.5378, 121.0014],
  [['pasig', 'pasig city', 'ortigas', 'ortigas center', 'ortigas ave', 'kapitolyo', 'rosario pasig', 'eastwood', 'ugong'], 'Pasig', NCR, 14.5866, 121.0613],
  [['san juan', 'greenhills', 'san juan city'], 'San Juan', NCR, 14.6019, 121.0355],
  [['taguig', 'taguig city', 'bgc', 'bonifacio global city', 'fort bonifacio', 'global city', 'western bicutan'], 'Taguig', NCR, 14.5176, 121.0509],
  [['valenzuela', 'valenzuela city'], 'Valenzuela', NCR, 14.7011, 120.9830], [['pateros'], 'Pateros', NCR, 14.5453, 121.0685],
  // Rizal
  [['cainta', 'vista verde', 'sta lucia', 'junction cainta'], 'Cainta', 'Rizal', 14.5778, 121.1222], [['taytay'], 'Taytay', 'Rizal', 14.5569, 121.1323],
  [['antipolo', 'antipolo city'], 'Antipolo', 'Rizal', 14.5863, 121.1758], [['san mateo rizal', 'san mateo'], 'San Mateo', 'Rizal', 14.6969, 121.1217],
  [['rodriguez rizal', 'montalban'], 'Rodriguez', 'Rizal', 14.7592, 121.1450], [['binangonan'], 'Binangonan', 'Rizal', 14.4654, 121.1927], [['angono'], 'Angono', 'Rizal', 14.5266, 121.1537],
  // Cavite
  [['bacoor'], 'Bacoor', 'Cavite', 14.4624, 120.9645], [['imus'], 'Imus', 'Cavite', 14.4297, 120.9367], [['dasmarinas', 'dasma'], 'Dasmariñas', 'Cavite', 14.3294, 120.9367],
  [['cavite city'], 'Cavite City', 'Cavite', 14.4791, 120.8970], [['tagaytay', 'tagaytay city'], 'Tagaytay', 'Cavite', 14.1153, 120.9621], [['silang'], 'Silang', 'Cavite', 14.2306, 120.9758],
  [['general trias', 'gen trias'], 'General Trias', 'Cavite', 14.3869, 120.8814], [['carmona'], 'Carmona', 'Cavite', 14.3139, 121.0577], [['kawit'], 'Kawit', 'Cavite', 14.4380, 120.9030],
  // Laguna
  [['santa rosa', 'sta rosa', 'sta rosa laguna', 'balibago', 'nuvali', 'paseo de sta rosa'], 'Santa Rosa', 'Laguna', 14.3122, 121.1114], [['binan', 'binan laguna'], 'Biñan', 'Laguna', 14.3333, 121.0833],
  [['calamba', 'calamba city'], 'Calamba', 'Laguna', 14.2117, 121.1653], [['san pedro laguna', 'san pedro'], 'San Pedro', 'Laguna', 14.3595, 121.0473], [['cabuyao'], 'Cabuyao', 'Laguna', 14.2723, 121.1251],
  [['los banos'], 'Los Baños', 'Laguna', 14.1700, 121.2417], [['san pablo', 'san pablo city'], 'San Pablo', 'Laguna', 14.0683, 121.3256], [['sta cruz laguna', 'santa cruz laguna'], 'Santa Cruz', 'Laguna', 14.2811, 121.4150],
  // Batangas
  [['batangas city'], 'Batangas City', 'Batangas', 13.7565, 121.0583], [['tanauan', 'tanauan city'], 'Tanauan', 'Batangas', 14.0859, 121.1497], [['lipa', 'lipa city'], 'Lipa', 'Batangas', 13.9411, 121.1631],
  [['santo tomas batangas', 'sto tomas', 'santo tomas'], 'Santo Tomas', 'Batangas', 14.1078, 121.1414], [['nasugbu'], 'Nasugbu', 'Batangas', 14.0689, 120.6322], [['lemery'], 'Lemery', 'Batangas', 13.8861, 120.9156],
  // Bulacan / Central Luzon
  [['san rafael', 'san rafael bulacan'], 'San Rafael', 'Bulacan', 14.9628, 120.9456], [['malolos', 'malolos city'], 'Malolos', 'Bulacan', 14.8433, 120.8114], [['meycauayan'], 'Meycauayan', 'Bulacan', 14.7370, 120.9608],
  [['san jose del monte', 'sjdm'], 'San Jose del Monte', 'Bulacan', 14.8139, 121.0453], [['marilao'], 'Marilao', 'Bulacan', 14.7581, 120.9483], [['baliuag', 'baliwag'], 'Baliuag', 'Bulacan', 14.9544, 120.8969], [['bocaue'], 'Bocaue', 'Bulacan', 14.7978, 120.9264],
  [['angeles', 'angeles city', 'clark'], 'Angeles', 'Pampanga', 15.1450, 120.5887], [['san fernando pampanga', 'san fernando'], 'San Fernando', 'Pampanga', 15.0286, 120.6898], [['mabalacat'], 'Mabalacat', 'Pampanga', 15.2194, 120.5733],
  [['olongapo', 'subic'], 'Olongapo', 'Zambales', 14.8292, 120.2828], [['balanga'], 'Balanga', 'Bataan', 14.6760, 120.5360], [['cabanatuan'], 'Cabanatuan', 'Nueva Ecija', 15.4859, 120.9670],
  [['tarlac city', 'tarlac'], 'Tarlac City', 'Tarlac', 15.4755, 120.5963], [['baguio', 'baguio city'], 'Baguio', 'Benguet', 16.4023, 120.5960], [['dagupan'], 'Dagupan', 'Pangasinan', 16.0433, 120.3333],
  [['san fernando la union'], 'San Fernando', 'La Union', 16.6159, 120.3209], [['laoag'], 'Laoag', 'Ilocos Norte', 18.1978, 120.5936], [['vigan'], 'Vigan', 'Ilocos Sur', 17.5747, 120.3869], [['tuguegarao'], 'Tuguegarao', 'Cagayan', 17.6132, 121.7270],
  // Bicol / MIMAROPA
  [['lucena', 'lucena city'], 'Lucena', 'Quezon', 13.9373, 121.6170], [['legazpi', 'legazpi city'], 'Legazpi', 'Albay', 13.1391, 123.7438], [['naga city', 'naga'], 'Naga', 'Camarines Sur', 13.6218, 123.1948],
  [['puerto princesa'], 'Puerto Princesa', 'Palawan', 9.7392, 118.7353], [['calapan'], 'Calapan', 'Oriental Mindoro', 13.4119, 121.1803],
  // Visayas
  [['cebu city', 'cebu'], 'Cebu City', 'Cebu', 10.3157, 123.8854], [['mandaue'], 'Mandaue', 'Cebu', 10.3236, 123.9223], [['lapu lapu', 'lapu-lapu', 'mactan'], 'Lapu-Lapu', 'Cebu', 10.3103, 123.9494],
  [['iloilo', 'iloilo city'], 'Iloilo City', 'Iloilo', 10.7202, 122.5621], [['bacolod', 'bacolod city'], 'Bacolod', 'Negros Occidental', 10.6713, 122.9511], [['dumaguete'], 'Dumaguete', 'Negros Oriental', 9.3068, 123.3054],
  [['tacloban', 'tacloban city'], 'Tacloban', 'Leyte', 11.2543, 124.9630], [['tagbilaran', 'bohol'], 'Tagbilaran', 'Bohol', 9.6496, 123.8554], [['kalibo'], 'Kalibo', 'Aklan', 11.7086, 122.3650], [['boracay', 'malay aklan'], 'Malay (Boracay)', 'Aklan', 11.9674, 121.9248],
  // Mindanao
  [['davao', 'davao city'], 'Davao City', 'Davao del Sur', 7.1907, 125.4553], [['cagayan de oro', 'cdo'], 'Cagayan de Oro', 'Misamis Oriental', 8.4542, 124.6319], [['general santos', 'gensan'], 'General Santos', 'South Cotabato', 6.1164, 125.1716],
  [['zamboanga', 'zamboanga city'], 'Zamboanga City', 'Zamboanga del Sur', 6.9214, 122.0790], [['butuan'], 'Butuan', 'Agusan del Norte', 8.9475, 125.5406], [['iligan'], 'Iligan', 'Lanao del Norte', 8.2280, 124.2452], [['cotabato city'], 'Cotabato City', 'Maguindanao', 7.2231, 124.2452],
  // Provinces (used only when the address names no city)
  [['laguna'], '', 'Laguna', 14.2700, 121.3000, 'province'], [['rizal'], '', 'Rizal', 14.6040, 121.3080, 'province'], [['cavite'], '', 'Cavite', 14.2800, 120.8700, 'province'], [['batangas'], '', 'Batangas', 13.9400, 121.0000, 'province'],
  [['bulacan'], '', 'Bulacan', 14.8000, 120.9000, 'province'], [['pampanga'], '', 'Pampanga', 15.0500, 120.6600, 'province'], [['quezon province'], '', 'Quezon', 14.0300, 121.9000, 'province'], [['metro manila', 'ncr', 'manila'], '', NCR, 14.5995, 121.0000, 'province'],
  [['cebu province'], '', 'Cebu', 10.3000, 123.9000, 'province'], [['pangasinan'], '', 'Pangasinan', 15.9000, 120.3000, 'province'], [['nueva ecija'], '', 'Nueva Ecija', 15.6000, 121.0000, 'province'], [['zambales'], '', 'Zambales', 15.3000, 120.1000, 'province'],
];
export const PH_CENTER: [number, number] = [12.8797, 121.774];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, ' ').trim();
const INDEX = PLACES.flatMap((p) => p[0].map((a) => ({ alias: norm(a), p }))).sort((a, b) => b.alias.length - a.alias.length);

export interface Place { city: string; province: string; lat: number; lng: number; level: 'area' | 'city' | 'province'; matched: string }
/** Best matching place named in an address: the longest alias wins (so "San Rafael, Bulacan" is San Rafael, not just Bulacan). */
export function locate(address: string): Place | null {
  const text = ` ${norm(address)} `; if (text.trim() === '') return null;
  const found = INDEX.filter((e) => text.includes(` ${e.alias} `));
  if (!found.length) return null;
  const nonProv = found.filter((e) => e.p[5] !== 'province'); const best = (nonProv[0] ?? found[0]);
  const [aliases, city, province, lat, lng, kind] = best.p;
  const isCityName = aliases.some((a, i) => i === 0 && norm(a) === best.alias);
  return { city, province, lat, lng, level: kind === 'province' ? 'province' : isCityName ? 'city' : 'area', matched: best.alias };
}

/** Geo fields for an address. Never overrides coordinates an Admin typed in for the same address. */
export function geoPatch(address: string, current?: Partial<GeoFields>): Partial<GeoFields> {
  const addr = (address ?? '').trim();
  if (current?.geo_source === 'manual' && current.geo_address === addr) return {};
  if (current?.geo_source === 'geocoder' && current.geo_address === addr) return {};            // already street-level for this exact address
  const at = new Date().toISOString();
  const hit = locate(addr);
  if (!hit) return { geo_status: 'unmapped', geo_source: undefined, geo_precision: undefined, geo_address: addr, geo_at: at, lat: undefined, lng: undefined, city: undefined, province: undefined, geo_tries: 0 };
  return { lat: hit.lat, lng: hit.lng, city: hit.city || undefined, province: hit.province, geo_source: 'address-match', geo_precision: hit.level, geo_status: 'approximate', geo_address: addr, geo_at: at, geo_tries: 0 };
}
/** Called after a saved address changed, so the app can look up a street-level position in the background. */
export const geoHooks: { onChange?: () => void } = {};
