export function installPoolBonds(G) {
  function settleYourPoolBonds(dt) {
    for (const pool of G.s.pools) {
      if (pool.owner !== 'you' || !pool.live) continue;
      const chain = G.chain(pool.chain);
      if (pool.scheme === 'PPS') {
        const owed = (dt * G.poolHash(pool) / G.diffOf(chain)) * chain.reward * G.price(chain) * (1 - pool.fee);
        pool.bond -= owed;
        pool.earned -= owed;
      }
      if (pool.bond > 0) continue;
      pool.bond = 0;
      G.closeSimPool(pool, 'when the pool failed');
      G.say('bad', pool.name + ' could not pay its miners and closed — the bond is gone');
      G.pop('Your pool failed', 'it could not cover payouts', 'dark', { always: true });
    }
  }

  Object.assign(G, { settleYourPoolBonds });
}
