export const CITY_STATE: Record<string, string> = {
  Mumbai: "Maharashtra",
  Thane: "Maharashtra",
  Pune: "Maharashtra",
  Nagpur: "Maharashtra",
  Bengaluru: "Karnataka",
  Hyderabad: "Telangana",
  Gurugram: "Haryana",
  Noida: "Uttar Pradesh",
};

export function stateForCity(city: string) {
  return CITY_STATE[city] ?? "Maharashtra";
}
