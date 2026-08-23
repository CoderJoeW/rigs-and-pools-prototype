export function pushCapped(arr, value, max) {
  arr.push(value);
  if (arr.length > max) arr.shift();
}

export function addTo(bucket, partId) {
  const entry = bucket.find(item => item.p === partId);
  if (entry) entry.n++;
  else bucket.push({ p: partId, n: 1 });
}
