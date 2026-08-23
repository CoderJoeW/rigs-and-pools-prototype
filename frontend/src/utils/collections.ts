export function pushCapped<T>(arr: T[], value: T, max: number): void {
  arr.push(value);
  if (arr.length > max) arr.shift();
}

export interface CountedPart { p: string; n: number }

export function addTo(bucket: CountedPart[], partId: string): void {
  const entry = bucket.find(item => item.p === partId);
  if (entry) entry.n++;
  else bucket.push({ p: partId, n: 1 });
}
