// Presentation-only succession boundary, verified from the current live term.
// Extending/editing this same appointment must not inaugurate a new regime.
export const GENERAL_REIGN_BOUNDARY=Object.freeze({
  appointmentId:'7497d6d5-51f8-4b18-a545-0f57bebddfd5',
  userId:4977,
  startsAt:'2026-09-28T17:56:36.580Z'
});

export function chiefReignStyle(appointment){
  const id=String(appointment?.id||appointment?.appointmentId||'');
  const startsAt=Date.parse(appointment?.startsAt);
  return id&&id!==GENERAL_REIGN_BOUNDARY.appointmentId&&
    Number.isFinite(startsAt)&&startsAt>Date.parse(GENERAL_REIGN_BOUNDARY.startsAt)
    ?'GENERAL':'QUEEN';
}
