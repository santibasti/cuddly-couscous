// "Auto-enhance photos" switch shared by the places that upload photos. The choice is remembered on this device.
import { useState } from 'react';
import { getEnhance, setEnhance } from '@/lib/photos';

export function EnhanceToggle() {
  const [on, setOn] = useState(getEnhance());
  return (
    <label className="row small" style={{ gap: 6, cursor: 'pointer' }} title="Evens out dull or dark photos and adds a little colour and sharpness when you upload. Applies to new uploads only.">
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setEnhance(e.target.checked); }} /> ✨ Auto-enhance new photos
    </label>
  );
}
