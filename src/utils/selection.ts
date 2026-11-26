/** Tri-state for a header over `paths`: how many of them are selected. */
export function selectionState(paths: string[], selected: ReadonlySet<string>) {
  const count = paths.filter((path) => selected.has(path)).length;
  return {
    count,
    all: paths.length > 0 && count === paths.length,
    some: count > 0 && count < paths.length,
  };
}
