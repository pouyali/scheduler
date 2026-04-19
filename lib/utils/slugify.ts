export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")        // non-alphanum → underscore
    .replace(/^_+|_+$/g, "");           // trim leading/trailing underscores
}
