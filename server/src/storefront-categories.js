// Stock-zero products remain visible in the catalogue. Hidden products do not
// make a category visible. Filter across the full store, not the search result.
export const populatedCategories = (categories, products) => {
  const ids = new Set(products.filter(p => p.categoryId != null).map(p => String(p.categoryId)));
  return categories.filter(c => ids.has(String(c.id)));
};
