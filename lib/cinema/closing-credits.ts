const quietDivideCredits = {
  artists: ["Ân Trịnh", "Nathan Syed-Tollan"],
  venue: "Phố Bên Đồi",
  shortPhotoId: "6f13ce78-add2-4db1-b170-291e3c145091",
};

export function getCinemaClosingCredits(eventSlug: string | null) {
  return eventSlug === "a-quiet-divide-tu-scotland-den-da-lat-2026"
    ? quietDivideCredits
    : undefined;
}
