const toRad = d => d * Math.PI / 180;
// Great-circle distance in km between two lat/lng points.
export const haversineKm = (lat1, lon1, lat2, lon2) => {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
};
