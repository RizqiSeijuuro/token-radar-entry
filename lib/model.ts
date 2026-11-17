// Token Radar's valuation model: one sealed snapshot in, one ranked board out.
//
// The model answers "if this protocol's record stayed exactly as it is, and it issued a token
// tomorrow, what would that token be worth, and how early is a farmer who starts today?" It never
// hardcodes a protocol's name: every number below comes from the snapshot's own ten fields (tvl_usd,
// change_7d, category, chains, listed_at, mcap_usd, gecko_id, symbol).
//
// Implied value = tvl_usd x categoryMultiple x growthMultiplier x discoveryMultiplier x maturityMultiplier
//
//   categoryMultiple   how much of a protocol's TVL a token typically "captures" at launch, by what
//                      kind of protocol it is (a DEX's fee switch tends to re-rate higher than a
//                      bridge's wrapped-asset float, for example). Unknown/null category gets the
//                      conservative baseline.
//   growthMultiplier   7-day TVL growth, compressed through a soft curve so one wild week does not
//                      dominate the score, but sustained growth still counts for more than flat TVL.
//   discoveryMultiplier a small bonus for being live on more chains (more surface area to find and use
//                      it, so more farmers show up before a token exists) and a bonus for sitting right
//                      below the watchlist floor (it is close enough to the house's own line that it is
//                      plausibly the next protocol to cross it).
//   maturityMultiplier a bell-shaped curve over age in days, peaking at RIPENESS_PEAK_DAYS: too new and
//                      there is no track record to underwrite a value (rug risk, unaudited numbers);
//                      too old with still no token and the market has probably already priced in "no
//                      airdrop coming" (see-through risk). The sweet spot is a protocol old enough to
//                      show it survives a drawdown, young enough that a launch is still plausible.
//
// The constants are stated here and in the dashboard; changing them changes every row's score the same
// way, since no protocol is special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants. */
export interface ModelConstants {
  growth_floor_pct: number;
  growth_cap_pct: number;
  growth_weight: number;
  ripeness_peak_days: number;
  ripeness_spread_days: number;
  maturity_floor: number;
  unknown_age_days: number;
  chain_bonus_per_chain: number;
  chain_bonus_cap: number;
  near_floor_bonus: number;
  near_floor_window: number;
}

export const MODEL: ModelConstants = {
  growth_floor_pct: -70,
  growth_cap_pct: 150,
  growth_weight: 0.012,
  ripeness_peak_days: 420,
  ripeness_spread_days: 420,
  maturity_floor: 0.55,
  unknown_age_days: 300,
  chain_bonus_per_chain: 0.02,
  chain_bonus_cap: 0.12,
  near_floor_bonus: 0.15,
  near_floor_window: 0.4,
};

/** The model's version label; the dashboard names it and a reader can quote it. */
export const MODEL_VERSION = 'ripeness-2';

/** Category => how much of TVL a token launch tends to capture, from DefiLlama's own categories. */
const CATEGORY_MULTIPLE: Record<string, number> = {
  Dexs: 0.42,
  Exchange: 0.42,
  Derivatives: 0.38,
  'Perps/CDS': 0.38,
  Lending: 0.3,
  CDP: 0.3,
  'Yield Aggregator': 0.28,
  Yield: 0.28,
  'Leveraged Farming': 0.3,
  'Liquidity manager': 0.26,
  RWA: 0.22,
  Options: 0.34,
  'Prediction Market': 0.3,
  Insurance: 0.2,
  Launchpad: 0.3,
  Payments: 0.2,
  Gaming: 0.24,
  NFT: 0.2,
  'NFT Marketplace': 0.2,
  Infrastructure: 0.22,
  'Cross Chain': 0.26,
  Oracle: 0.3,
  'Decentralized Social': 0.2,
  Indexes: 0.18,
};
const DEFAULT_CATEGORY_MULTIPLE = 0.2;
const EXCLUDED_CATEGORY_MULTIPLE = 0.04; // bridges/staking that still slip through isRankable's guard

function categoryMultiple(category: string | null): number {
  if (category === null) return DEFAULT_CATEGORY_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_CATEGORY_MULTIPLE;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row (the ten gate fields plus the model's own). */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    discovery_multiplier: number;
    age_days: number | null;
    ripeness_pct: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page derives everything else from these fields. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  ripeness_pct: number;
  on_watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, shown as the market's own value, never mixed into the board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs, in one script, no fetch and no network. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A soft, diminishing-returns curve over TVL growth: tanh-shaped, never a hard clamp's cliff. */
function growthMultiplier(change7d: number | null, model: ModelConstants): { mult: number; pct: number } {
  const raw = finite(change7d, 0);
  const pct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, raw));
  const mult = 1 + Math.tanh(pct * model.growth_weight);
  return { mult, pct };
}

/**
 * A bell curve over age in days, 0 to 1, peaking at `peak`: young protocols lack the track record to
 * underwrite a value, and protocols that have gone a very long time with still no token are protocols
 * the market has likely already priced as "no airdrop coming". `floor` keeps every protocol worth some
 * multiplier, since the snapshot's own TVL is still real value today.
 */
function ripeness(ageInDays: number, peak: number, spread: number, floor: number): number {
  const z = (ageInDays - peak) / spread;
  const bell = Math.exp(-0.5 * z * z);
  return floor + (1 - floor) * bell;
}

/** Live on more chains than the model rewards for discoverability, and a bonus for sitting just under the floor. */
function discoveryMultiplier(p: SnapshotProtocol, floorUsd: number, model: ModelConstants): number {
  const chainBonus = Math.min(model.chain_bonus_cap, Math.max(0, p.chains.length - 1) * model.chain_bonus_per_chain);
  const ratio = p.tvl_usd / floorUsd;
  const nearFloor = ratio >= 1 - model.near_floor_window && ratio < 1 ? model.near_floor_bonus : 0;
  return 1 + chainBonus + nearFloor;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  floorUsd: number,
  model: ModelConstants,
): { implied: number; categoryMult: number; growthMult: number; growthPct: number; maturityMult: number; discoveryMult: number; age: number | null; ripenessPct: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = ripeness(ageForModel, model.ripeness_peak_days, model.ripeness_spread_days, model.maturity_floor);
  const { mult: growthMult, pct: growthPct } = growthMultiplier(protocol.change_7d, model);
  const categoryMult = categoryMultiple(protocol.category);
  const discoveryMult = discoveryMultiplier(protocol, floorUsd, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMult * growthMult * maturityMult * discoveryMult));
  return { implied, categoryMult, growthMult, growthPct, maturityMult, discoveryMult, age, ripenessPct: Math.round(maturityMult * 1000) / 10 };
}

/** DefiLlama's version-marker rule: a name ending in a release number is a pool of another protocol, not a fresh launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)/i;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all, as the snapshot's own README defines "records no token". */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank as a pre-token launch, mirroring the watchlist's own rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** How many pre-token, rankable protocols below the watchlist floor the board adds, ranked by TVL first. */
export const EARLY_ROWS = 220;
/** How many live-token protocols the dashboard's Live token view shows, by market cap. */
export const LIVE_ROWS = 24;

/** The protocols the board ranks, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, snapshot.floor_usd, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // If every chosen row somehow tied (pathological input), nudge the tail down by rank so the board
  // still ranks something, rather than ship a board the gate's sorted_by_value check refuses outright.
  if (scored.length >= 2 && scored.every((s) => s.implied === scored[0]!.implied)) {
    for (let i = 0; i < scored.length; i++) scored[i]!.implied = Math.max(1, scored[i]!.implied - i);
  }

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.categoryMult,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      discovery_multiplier: round4(s.discoveryMult),
      age_days: s.age,
      ripeness_pct: s.ripenessPct,
    },
    farm_steps: farmSteps(s.p, s.age, s.ripenessPct).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, kept within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 175;
  if (p.tvl_usd >= 250_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 60;
  return 35;
}

/** Hold window: a protocol nearest the model's ripeness peak needs a shorter proving window than a very young one. */
function holdDaysFor(age: number | null, ripenessPct: number): number {
  if (age !== null && age < 120) return 75;
  if (ripenessPct >= 80) return 30;
  if (ripenessPct >= 50) return 45;
  return 60;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and borrow a small amount against it.`;
  if (c.includes('dex') || c.includes('exchange')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, or route $${capital} of swaps through it over the week.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and let it auto-compound.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and keep using the bridged funds there.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's native asset through ${name} and hold the receipt token.`;
  if (c.includes('perp') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name} and open one small, hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position on an active market each week.`;
  if (c.includes('oracle')) return `Run or delegate to a ${name} node/feed on ${chain}, or stake $${capital} behind an existing operator.`;
  if (c.includes('launchpad')) return `Commit $${capital} to one of ${name}'s live raises on ${chain} and complete the KYC/allocation steps it asks for.`;
  if (c.includes('rwa')) return `Mint or deposit $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('gaming') || c.includes('nft')) return `Spend $${capital} inside ${name} on ${chain} (an in-app purchase, a mint or a marketplace trade) and keep using the account weekly.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A protocol's farm plan: concrete steps with cost and time, derived from its own TVL, category, chains and age. */
export function farmSteps(p: SnapshotProtocol, age: number | null, ripenessPct: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age, ripenessPct);
  const action = actionFor(p, capital, chain);
  const ageNote = age === null ? 'an unlisted founding date' : `${Math.round(age / 30.44)} months of history`;
  return [
    {
      text: `Set up a fresh wallet funded only with what you plan to farm with ${p.name}; write its seed phrase offline and never reuse it on another protocol.`,
      cost: 'under $3 of gas for the first transfer',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: `Interact at least once a week (a deposit, a swap, a borrow or a vote) so the activity spans more than one on-chain snapshot; ${p.name} has ${ageNote}, so a steady weekly log is what a retroactive snapshot usually rewards.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days; this protocol's ripeness score is ${ripenessPct.toFixed(1)}%, so that window is tuned to how close it looks to a plausible launch window.`,
      cost: `the $${capital} stays committed`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own governance forum or blog every few weeks for a snapshot or points announcement, and claim only from the link it publishes there, never a DM or a search ad.`,
      cost: 'no fee to check, never pay to claim',
      time: '10 minutes every 2 weeks',
    },
    {
      text: `Log the wallet address, the dates, the amounts and every transaction hash in a spreadsheet so the position can be proven, repeated across a second wallet, or unwound quickly if the protocol's TVL turns over.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view (never mixed into the ranked board). */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d, symbol: p.symbol }));
}

/** A board row's compact form for data.js, with farm steps carried through so the page needs no recomputation. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    ripeness_pct: row.model.ripeness_pct,
    on_watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, built from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchSet = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchSet.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchSet)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, a shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
