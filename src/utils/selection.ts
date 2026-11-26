/** Tri-state for a header over `paths`: how many of them are selected. */
export function selectionState(paths: string[], selected: ReadonlySet<string>) {
  const count = paths.filter((path) => selected.has(path)).length;
  return {
    count,
    all: paths.length > 0 && count === paths.length,
    some: count > 0 && count < paths.length,
  };
}

/**
 * Whether a filter button is shown: "all" always, others while they match something — and the
 * active one even at zero, so emptying it never leaves a filter applied with no button for it.
 */
export function isFilterShown(key: string, active: string, count: number): boolean {
  return key === 'all' || key === active || count > 0;
}
