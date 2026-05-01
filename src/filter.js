const skip = (val, min, max = Infinity) => {
  if (val === null || val === undefined) return false;
  if (val < min) return true;
  if (val > max) return true;
  return false;
};

export function applyCriteria(listing, search) {
  if (skip(listing.price, search.priceMin ?? 0, search.priceMax ?? Infinity)) return false;
  if (skip(listing.beds, search.bedsMin ?? 0)) return false;
  if (skip(listing.baths, search.bathsMin ?? 0)) return false;
  if (skip(listing.sqft, search.sqftMin ?? 0)) return false;
  if (skip(listing.lotSqft, search.lotMin ?? 0)) return false;
  return true;
}
