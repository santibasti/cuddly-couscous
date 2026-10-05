// Tap-to-fill phrases for the field screens (keeps typing to a minimum on a tablet).
export const PRESETS = {
  hqNotes: ['Van fueled', 'Spare hose loaded', 'Extra squeegees loaded', 'Chemicals double-checked'],
  shortage: ['Item at supplier', 'Item with another crew', 'Replacement booked', 'Client accepted reduced scope', 'Will be delivered to site'],
  vehicleIssue: ['Warning light on', 'Low tyre pressure', 'Dent / scratch', 'Brake noise', 'Aircon not working'],
  dispatch: ['Left on time', 'Left late – traffic at HQ', 'Waiting for last crew member'],
  absent: ['Sick leave', 'Emergency leave', 'Joining site later', 'Reassigned to another job', 'No show'],
  site: ['Access via service entrance', 'Register at security desk', 'Water source available', 'Wet-floor signage placed', 'Working at heights – harness required', 'Client escort required'],
  start: ['Area cordoned off', 'Client informed', 'Weather clear', 'Weather – light rain, proceeding'],
  findings: ['Heavy mineral deposits', 'Bird droppings / moss', 'Sealant deterioration noted', 'No structural concerns', 'Work completed without issues'],
  limits: ['Areas beyond reach excluded', 'Heights above permitted limit excluded', 'Interior areas not accessible', 'Weather interruption'],
  recs: ['Quarterly maintenance cleaning', 'Monthly maintenance cleaning', 'Seal / repair frames', 'Install anti-bird spikes'],
  complimentary: ['Entrance door glass wiped', 'Signage wiped', 'Window sills wiped', 'None'],
  method: ['Water-fed pole, purified water', 'Soft-brush agitation', 'Squeegee finish', 'Roped access', 'Pressure wash (low pressure)'],
  returnNote: ['Left at site – client keeps', 'Damaged during use', 'Lost on site', 'Returned to wrong van'],
  leave: ['Site cleaned and cleared', 'Client signed off', 'Waiting for client escort out'],
  variation: ['Additional glass panels found on site', 'Client requested added area', 'Scope change – quantities increased', 'Access difficulty – extra labor'],
  conforme: ['Client requested a copy by email', 'Signed by authorized representative'],
} as const;
