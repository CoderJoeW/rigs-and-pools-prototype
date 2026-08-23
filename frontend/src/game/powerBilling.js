import { SITEPART } from '../data/site-parts.js';
import { dayIndexOf } from '../utils/calendar.js';

export function installPowerBilling(G) {
  function billPower(dt, days, hrs) {
    const bill = G.powerRateDay.value * days;
    G.s.cash -= bill;
    G.s.powerPaid += bill;
    G.today().power += bill;
    const dayIdx = dayIndexOf(G.s.t);
    for (const site of G.s.sites) billSitePower(site, dayIdx, hrs);
  }

  function billSitePower(site, dayIdx, hrs) {
    if (!site.bill || site.bill.day !== dayIdx) site.bill = { day: dayIdx, off: 0, sh: 0, peak: 0, cool: 0, saved: 0 };
    const flow = G.flowOf(site);
    const hourCost = G.siteCostPerHour(site) * hrs;
    const band = G.band.value === 'off' ? 'off' : G.band.value === 'peak' ? 'peak' : 'sh';
    site.bill[band] += hourCost;
    if (flow.load > 0) site.bill.cool += hourCost * flow.cool / flow.load;
    const gridRate = site.sources.reduce((minRate, source) => {
      const sourcePart = SITEPART(source.p);
      return sourcePart.rate > 0 ? Math.min(minRate, G.rateAt(sourcePart)) : minRate;
    }, 15.00);
    site.bill.saved += (flow.inRenew + flow.inBatt) / 1000 * hrs * gridRate;
  }

  Object.assign(G, { billPower });
}
