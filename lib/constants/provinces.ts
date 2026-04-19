export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];
export const PROVINCE_CODES: ProvinceCode[] = PROVINCES.map((p) => p.code);

export function isProvinceCode(value: unknown): value is ProvinceCode {
  return typeof value === "string" && (PROVINCE_CODES as string[]).includes(value);
}
