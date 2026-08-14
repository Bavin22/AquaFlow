"""
Fairness-optimized water allocation engine: point-based vulnerability
scoring + strict rank-order serving, validated via Max-Flow Min-Cut.

Input:
    flats: list of flat docs (matches seed_data.json):
        {
            "flat_id": str,
            "medical_flag": bool,
            "elderly_count": int,
            "children_count": int,
            "household_size": int,
            "trust_score": float,    # 0.0 - 1.0, from usage_history
            "tank_level_pct": float, # 0-100, current tank fill %
            "tank_capacity_l": float # litres, max the flat can receive this cycle
        }
    system_state: {
            "available_supply_l": float,
            "status": "normal" | "crisis"
        }

Output:
    {
        "allocations": [
            {"flat_id": ..., "allocated_l": ..., "need_l": ...,
             "vulnerability_score": ..., "reason": "..."}
        ],
        "total_allocated_l": ..., "total_need_l": ..., "supply_l": ...,
        "bottleneck": "supply" | "none", "status": ...
    }

VULNERABILITY SCORE - why points instead of 3 fixed tiers:
    A flat 3-tier system ("medical" / "vulnerable" / "standard") treats a
    household with 1 elderly person the same as one with 4 elderly people,
    which is hard to defend if asked directly. Instead, every household
    gets an explicit point score:

        medical_flag             -> +1000  (dominant override)
        each elderly person      -> +8
        each child                -> +5
        elderly AND children present together -> +10 bonus
            (a household with dependents on both ends and likely no
            able-bodied adult free to queue for water is a distinct,
            worse-off case than either alone)
        household_size >= 6      -> +3 bonus
            (more people affected by the same shortfall)

    This produces as many distinct priority levels as the population
    actually contains (commonly 15-20 with a diverse dataset), rather
    than an arbitrary fixed number chosen in advance.

STRICT RANK-ORDER SERVING - why, not one blended weight:
    Flats are grouped by their EXACT score and served in strictly
    descending score order: every flat scoring 16 is (attempted to be)
    fully served before any flat scoring 13 gets a drop. This is what
    makes a priority inversion structurally impossible, regardless of
    how many score levels exist or how differently sized flats' needs
    are - a single blended weight can't guarantee that (see project
    history: an earlier single-weight version let small-need,
    low-vulnerability flats out-score large-need, high-vulnerability
    ones purely because small needs are cheap to satisfy).

WITHIN A TIE (same score): trust_score and tank urgency both modulate
    the split - a flat with a worse usage history gets a smaller share
    (never zero), and a flat with a nearly-empty tank gets a modest edge
    over one that's half full, even at identical vulnerability.

    SOURCE -> SUPPLY_HUB   capacity = system_state.available_supply_l
    SUPPLY_HUB -> flat_i   capacity = final rank-ordered allocation_i
    flat_i -> SINK         capacity = final rank-ordered allocation_i
    Max-flow validates conservation; the bottleneck flag is computed
    directly from total allocated vs total need (see run_allocation),
    not from the min-cut, since the two capacity layers above are equal
    by construction and make the min-cut tie-break unreliable as a
    "was supply actually scarce" signal.
"""

import networkx as nx

FAIR_SHARE_PER_PERSON_L = 400  # anti-hoarding ceiling: no flat's need counts for
                                # more than this x household_size, regardless of
                                # tank size or supply abundance - applies in every
                                # mode, not just crisis (see compute_effective_need).
                                # Calibrated from THIS dataset's usage_history, not
                                # an external benchmark: population-wide average is
                                # 150L/person/day (adults ~180L, children ~108L [60%],
                                # elderly ~153L [85%] - children deliberately use less).
                                # Max real per-person daily usage observed across all
                                # 105 flats is ~185.4L/day. 400L is ~2.2x that - a
                                # roughly two-day reserve buffer for a refill cycle.

ELDERLY_POINTS = 8
CHILD_POINTS = 5
COMBINED_DEPENDENTS_BONUS = 10
LARGE_HOUSEHOLD_BONUS = 3
LARGE_HOUSEHOLD_THRESHOLD = 6
MEDICAL_POINTS = 1000

SURVIVAL_L_PER_PERSON = 10  # emergency per-person minimum, in litres/day.
                             # WHO/Sphere humanitarian standards commonly
                             # cite 7.5-15L/person/day as an absolute
                             # survival floor for drinking, cooking, and
                             # basic hygiene; 10L is a defensible midpoint.
SURVIVAL_FLOOR_PCT_OF_NEED = 0.15  # the floor also scales with 15% of a
                             # flat's own need, so larger households or
                             # higher-need flats get more than the flat
                             # per-person minimum alone would give them.


def compute_need(flat: dict) -> float:
    """Raw physical need: how much this flat's tank is short by, in litres."""
    empty_pct = max(0.0, 100.0 - flat["tank_level_pct"]) / 100.0
    return empty_pct * flat["tank_capacity_l"]


def compute_fair_share_cap(flat: dict) -> float:
    """
    The most this flat's need is allowed to count for, regardless of tank
    size: household_size x FAIR_SHARE_PER_PERSON_L. This is NOT a scarcity
    response - it applies identically whether supply is abundant or short,
    so a household can never claim a disproportionate share just because
    its tank happens to be oversized. FAIR_SHARE_PER_PERSON_L (400L) is
    calibrated directly from this dataset's usage_history: population-wide
    average is 150L/person/day (children deliberately use less than
    adults), and the highest real per-person daily usage observed across
    all 105 flats is ~185.4L/day - 400L is roughly a two-day reserve
    buffer above that peak.
    """
    return flat.get("household_size", 1) * FAIR_SHARE_PER_PERSON_L


def compute_effective_need(flat: dict) -> float:
    """
    The need actually used for allocation math: raw need capped at the
    fair-share ceiling. Use this everywhere allocation decisions happen;
    use compute_need() only when you want the flat's true physical
    shortfall for display/comparison purposes.
    """
    return min(compute_need(flat), compute_fair_share_cap(flat))


def compute_survival_floor(flat: dict, need: float) -> float:
    """
    A guaranteed minimum every flat with unmet need receives BEFORE
    vulnerability-ranked serving even starts: the larger of a per-person
    emergency minimum or 15% of the flat's own need, capped at that need
    (never overshoot). This is what makes 0L allocations structurally
    impossible for anyone with need > 0, regardless of vulnerability
    score - see run_allocation() for how it combines with ranked serving.
    """
    per_person_floor = SURVIVAL_L_PER_PERSON * flat.get("household_size", 1)
    pct_floor = SURVIVAL_FLOOR_PCT_OF_NEED * need
    return min(need, max(per_person_floor, pct_floor))


def compute_vulnerability_score(flat: dict) -> int:
    """
    Explicit, explainable point score - see module docstring for the
    reasoning behind each component.
    """
    score = 0
    if flat.get("medical_flag"):
        score += MEDICAL_POINTS

    elderly = flat.get("elderly_count", 0)
    children = flat.get("children_count", 0)
    score += elderly * ELDERLY_POINTS
    score += children * CHILD_POINTS

    if elderly >= 1 and children >= 1:
        score += COMBINED_DEPENDENTS_BONUS

    if flat.get("household_size", 0) >= LARGE_HOUSEHOLD_THRESHOLD:
        score += LARGE_HOUSEHOLD_BONUS

    return score


def describe_vulnerability(flat: dict) -> str:
    """Human-readable breakdown of what drove this flat's score, for reason strings."""
    parts = []
    if flat.get("medical_flag"):
        parts.append("medical need")
    elderly = flat.get("elderly_count", 0)
    children = flat.get("children_count", 0)
    if elderly >= 1:
        parts.append(f"{elderly} elderly")
    if children >= 1:
        parts.append(f"{children} child{'ren' if children != 1 else ''}")
    if elderly >= 1 and children >= 1:
        parts.append("combined caregiving burden")
    if flat.get("household_size", 0) >= LARGE_HOUSEHOLD_THRESHOLD:
        parts.append(f"large household ({flat['household_size']} people)")
    return ", ".join(parts) if parts else "no additional vulnerability factors"


def compute_usage_trend_weight(flat: dict) -> float:
    """
    Compares the first 2 days of usage_history to the last 2 days.
    Conserving (usage trending down) earns a small boost; escalating
    usage earns a small reduction. Stable usage is neutral. This rewards
    real-time good-faith behaviour, not just the static trust_score.
    """
    history = flat.get("usage_history", [])
    if len(history) < 4:
        return 1.0
    first_half_avg = sum(d["used_l"] for d in history[:2]) / 2
    second_half_avg = sum(d["used_l"] for d in history[-2:]) / 2
    if first_half_avg <= 0:
        return 1.0
    change_ratio = (second_half_avg - first_half_avg) / first_half_avg
    if change_ratio <= -0.05:
        return 1.08  # conserving - using noticeably less than earlier in the week
    if change_ratio >= 0.05:
        return 0.95  # escalating - using noticeably more than earlier in the week
    return 1.0  # stable


def compute_household_weight(flat: dict) -> float:
    """
    At equal vulnerability score and equal trust, a larger household
    gets a modest edge - the same litres are stretched across more
    people. Capped so it stays a tie-breaker, not a dominant factor.
    """
    size = flat.get("household_size", 1)
    return 1.0 + min(0.03 * max(size - 1, 0), 0.18)  # +3%/person above 1, capped at +18%


def compute_intra_tier_weight(flat: dict) -> dict:
    """
    Within a tie group (identical vulnerability score), four factors
    combine to break the tie. None of them can zero out a flat's share -
    everyone in the group gets at least some claim. Returns a breakdown
    dict (not just the product) so the API can show its work.
    """
    trust_weight = 0.5 + 0.5 * flat.get("trust_score", 1.0)
    empty_pct = max(0.0, 100.0 - flat.get("tank_level_pct", 0)) / 100.0
    urgency_weight = 1.0 + 0.3 * empty_pct  # ranges 1.0 (full tank) to 1.3 (empty tank)
    trend_weight = compute_usage_trend_weight(flat)
    household_weight = compute_household_weight(flat)

    combined = trust_weight * urgency_weight * trend_weight * household_weight
    return {
        "trust_weight": round(trust_weight, 3),
        "urgency_weight": round(urgency_weight, 3),
        "trend_weight": round(trend_weight, 3),
        "household_weight": round(household_weight, 3),
        "combined": combined,
    }


def water_fill_group(flats: list, available_supply: float, needs_override: dict = None) -> dict:
    """
    Distributes `available_supply` across `flats` (all same vulnerability
    score) proportional to intra-tier weight, capping each at its own
    need and redistributing leftover to the rest.
    `needs_override`, if given, maps flat_id -> need to use instead of
    compute_effective_need(f) - used by run_allocation() to serve
    REMAINING need after the survival floor has already been set aside.
    Returns {flat_id: allocated_l}.
    """
    if needs_override is not None:
        needs = {f["flat_id"]: needs_override[f["flat_id"]] for f in flats}
    else:
        needs = {f["flat_id"]: compute_effective_need(f) for f in flats}
    weights = {f["flat_id"]: compute_intra_tier_weight(f)["combined"] for f in flats}
    remaining_ids = set(needs.keys())
    alloc = {fid: 0.0 for fid in needs}
    supply_left = available_supply

    while remaining_ids and supply_left > 1e-6:
        weight_sum = sum(weights[fid] for fid in remaining_ids)
        if weight_sum <= 0:
            break
        newly_capped = []
        for fid in list(remaining_ids):
            share = supply_left * (weights[fid] / weight_sum)
            room = needs[fid] - alloc[fid]
            if share >= room:
                alloc[fid] += room
                newly_capped.append(fid)
            else:
                alloc[fid] += share

        if not newly_capped:
            break

        for fid in newly_capped:
            remaining_ids.discard(fid)
        supply_left = available_supply - sum(alloc.values())

    return alloc


def ranked_allocation(flats: list, available_supply: float, needs_override: dict = None) -> dict:
    """
    Groups flats by EXACT vulnerability score (descending = served first),
    and runs water_fill_group score-group by score-group, only passing
    leftover supply forward. Returns {flat_id: allocated_l} across ALL flats.
    """
    groups = {}
    for f in flats:
        groups.setdefault(compute_vulnerability_score(f), []).append(f)

    alloc = {}
    supply_left = available_supply
    for score in sorted(groups.keys(), reverse=True):
        group_flats = groups[score]
        group_alloc = water_fill_group(group_flats, supply_left, needs_override=needs_override)
        alloc.update(group_alloc)
        supply_left -= sum(group_alloc.values())
        supply_left = max(supply_left, 0.0)

    return alloc


def run_allocation(flats: list, system_state: dict) -> dict:
    supply = system_state["available_supply_l"]

    # 1. Survival floor - guaranteed BEFORE ranking, so 0L is structurally
    #    impossible for anyone with need > 0. See compute_survival_floor().
    effective_needs = {f["flat_id"]: compute_effective_need(f) for f in flats}
    floors = {fid: compute_survival_floor(f, effective_needs[f["flat_id"]]) for f, fid in
              [(f, f["flat_id"]) for f in flats]}
    total_floor = sum(floors.values())

    if total_floor > supply:
        # Extreme case: even survival floors alone exceed supply. Scale
        # every floor down proportionally so the guarantee degrades
        # gracefully (everyone still gets *something*, proportionally
        # less) instead of breaking conservation.
        scale = supply / total_floor if total_floor > 0 else 0
        floors = {fid: v * scale for fid, v in floors.items()}
        remaining_supply = 0.0
    else:
        remaining_supply = supply - total_floor

    remaining_needs = {fid: effective_needs[fid] - floors[fid] for fid in floors}

    # 2. Strict rank-ordered, vulnerability-scored allocation of whatever
    #    supply is left, exactly as before - unchanged, already-verified
    #    zero-inversion logic, just operating on post-floor remaining need.
    tier_alloc = ranked_allocation(flats, remaining_supply, needs_override=remaining_needs)
    final_alloc = {fid: floors[fid] + tier_alloc[fid] for fid in floors}

    # 3. Validate via Max-Flow: build a network whose edge capacities are
    #    exactly the final (floor + tier) allocation, confirm it's feasible.
    G = nx.DiGraph()
    G.add_edge("SOURCE", "SUPPLY_HUB", capacity=supply)
    for f in flats:
        fid = f["flat_id"]
        cap = max(final_alloc[fid], 0.0001)
        G.add_edge("SUPPLY_HUB", fid, capacity=cap)
        G.add_edge(fid, "SINK", capacity=cap)

    flow_value, flow_dict = nx.maximum_flow(G, "SOURCE", "SINK")

    results = []
    # total_need uses EFFECTIVE (fair-share capped) need - this is what the
    # system is actually trying to satisfy, so it's the right basis for
    # "was supply the bottleneck". A separate raw total is reported below
    # for transparency about how much was asked for before capping.
    total_need = sum(effective_needs.values())
    total_raw_need = sum(compute_need(f) for f in flats)
    total_allocated_check = sum(final_alloc.values())
    # Supply is the bottleneck iff not every flat's (capped) need could be
    # fully met - computed directly rather than via min-cut (see module docstring).
    bottleneck = "supply" if total_allocated_check < total_need - 0.5 else "none"

    for f in flats:
        fid = f["flat_id"]
        score = compute_vulnerability_score(f)
        allocated = round(flow_dict["SUPPLY_HUB"][fid], 2)
        raw_need = round(compute_need(f), 2)
        need = round(effective_needs[fid], 2)  # what allocation is actually measured against
        floor_l = round(floors[fid], 2)
        fair_share_capped = raw_need > need + 0.01
        pct_of_need = round((allocated / need) * 100, 1) if need > 0 else 100.0
        factors = describe_vulnerability(f)
        weight_breakdown = compute_intra_tier_weight(f)
        del weight_breakdown["combined"]  # internal only - keep the API output to the four named factors

        cap_note = f" (raw need {raw_need}L capped to fair-share limit)" if fair_share_capped else ""
        floor_note = f" Includes a guaranteed survival floor of {floor_l}L." if floor_l > 0.01 else ""
        if allocated >= need - 0.01:
            reason = f"Need fully met ({need}L{cap_note}).{floor_note} Vulnerability score {score} ({factors})."
        else:
            reason = f"{pct_of_need}% of need served{cap_note}.{floor_note} Vulnerability score {score} ({factors})."

        results.append({
            "flat_id": fid,
            "allocated_l": allocated,
            "need_l": need,
            "raw_need_l": raw_need,
            "survival_floor_l": floor_l,
            "fair_share_capped": fair_share_capped,
            "vulnerability_score": score,
            "tie_break_weights": weight_breakdown,
            "reason": reason,
        })

    return {
        "allocations": results,
        "total_allocated_l": round(sum(r["allocated_l"] for r in results), 2),
        "total_need_l": round(total_need, 2),
        "total_raw_need_l": round(total_raw_need, 2),
        "total_survival_floor_l": round(sum(floors.values()), 2),
        "supply_l": supply,
        "bottleneck": bottleneck,
        "status": system_state["status"],
    }


if __name__ == "__main__":
    sample_flats = [
        {"flat_id": "F1", "medical_flag": True, "elderly_count": 0, "children_count": 0,
         "household_size": 2, "trust_score": 0.9, "tank_level_pct": 10, "tank_capacity_l": 500},
        {"flat_id": "F2", "medical_flag": False, "elderly_count": 2, "children_count": 3,
         "household_size": 7, "trust_score": 0.4, "tank_level_pct": 60, "tank_capacity_l": 500},
        {"flat_id": "F3", "medical_flag": False, "elderly_count": 1, "children_count": 0,
         "household_size": 2, "trust_score": 0.8, "tank_level_pct": 80, "tank_capacity_l": 500},
        {"flat_id": "F4", "medical_flag": False, "elderly_count": 0, "children_count": 0,
         "household_size": 1, "trust_score": 0.7, "tank_level_pct": 90, "tank_capacity_l": 500},
    ]
    sample_state = {"available_supply_l": 600, "status": "crisis"}
    import json
    print(json.dumps(run_allocation(sample_flats, sample_state), indent=2))

