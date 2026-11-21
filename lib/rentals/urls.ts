export function rentalListingPath({ id, slug, status }: { id: string; slug?: string | null; status: string }) {
  return "/rentals/listing/" + encodeURIComponent(status === "published" && slug ? slug : id);
}

export function isRentalSlug(value: string) {
  return value.length <= 220 && Array.from(value).length <= 110 && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(value);
}
