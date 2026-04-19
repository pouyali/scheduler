export type EligibilityVolunteer = {
  id: string;
  first_name: string;
  last_name: string;
  categories: string[];
  service_area: string | null;
  status: "pending" | "active" | "inactive";
};

export type RankedVolunteer = EligibilityVolunteer & { inArea: boolean };

export function rankEligibleVolunteers(
  volunteers: readonly EligibilityVolunteer[],
  senior: { city: string | null },
  category: string,
): RankedVolunteer[] {
  const city = senior.city?.trim() ?? "";
  const wholeWord = city
    ? new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
    : null;

  const eligible = volunteers.filter(
    (v) => v.status === "active" && v.categories.includes(category),
  );

  const ranked = eligible.map((v): RankedVolunteer => ({
    ...v,
    inArea: wholeWord ? wholeWord.test(v.service_area ?? "") : false,
  }));

  return ranked.sort((a, b) => {
    if (a.inArea !== b.inArea) return a.inArea ? -1 : 1;
    return a.last_name.localeCompare(b.last_name);
  });
}
