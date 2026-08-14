"""
Verifies an allocation for:
  1. Conservation   - no water lost or double-counted
  2. Feasibility    - nobody allocated more than they needed, nothing negative
  3. Survival floor - confirms nobody with unmet need receives 0L
  4. Fairness       - on the RANKED portion only (allocation above each
                      flat's survival floor), a higher-scored flat can
                      never be served worse than a lower-scored one.
                      The floor itself is deliberately NOT ranked - every
                      flat gets one regardless of vulnerability score, by
                      design (see engine.compute_survival_floor) - so
                      checking raw allocated_l/need_l here would flag
                      expected, intentional crossovers as bugs.

Usage (against the live API):
    python verify.py
(Assumes your FastAPI server is running on http://127.0.0.1:8000)
"""

import requests
from engine import compute_vulnerability_score, describe_vulnerability

BASE = "http://127.0.0.1:8000"


def get_flats_lookup():
    flats = requests.get(f"{BASE}/flats").json()["flats"]
    return {f["flat_id"]: f for f in flats}


def verify_allocation():
    system_state = requests.get(f"{BASE}/system-status").json()
    result = requests.post(f"{BASE}/allocate").json()
    flats = get_flats_lookup()

    allocations = result["allocations"]
    supply = result["supply_l"]

    print(f"=== Verifying allocation | status: {system_state['status']} | supply: {supply}L ===\n")

    total_allocated = sum(a["allocated_l"] for a in allocations)
    total_need = result.get("total_need_l", sum(a["need_l"] for a in allocations))
    expected_allocated = min(total_need, supply)
    conservation_ok = abs(total_allocated - expected_allocated) < 1.0
    print(f"[Conservation] allocated={total_allocated:.2f}L vs expected={expected_allocated:.2f}L "
          f"(min of need={total_need:.2f}L and supply={supply}L) "
          f"-> {'PASS' if conservation_ok else 'FAIL'}")

    feasibility_ok = True
    for a in allocations:
        if a["allocated_l"] < -0.01 or a["allocated_l"] > a["need_l"] + 0.01:
            feasibility_ok = False
            print(f"  VIOLATION: {a['flat_id']} allocated {a['allocated_l']} "
                  f"but needed {a['need_l']}")
    print(f"[Feasibility] -> {'PASS' if feasibility_ok else 'FAIL'}\n")

    zero_flats = [a for a in allocations if a["allocated_l"] <= 0.01 and a["need_l"] > 0.01]
    floor_ok = len(zero_flats) == 0
    total_floor = result.get("total_survival_floor_l", sum(a.get("survival_floor_l", 0) for a in allocations))
    print(f"[Survival floor] total floor guaranteed: {total_floor:.2f}L | "
          f"flats with 0L despite unmet need: {len(zero_flats)} -> {'PASS' if floor_ok else 'FAIL'}")
    if zero_flats:
        for a in zero_flats[:10]:
            print(f"  VIOLATION: {a['flat_id']} got 0L but needed {a['need_l']}L")
    print()

    rows = []
    for a in allocations:
        f = flats[a["flat_id"]]
        score = compute_vulnerability_score(f)
        floor = a.get("survival_floor_l", 0.0)
        # Fairness is checked on the RANKED portion only - what's left
        # after each flat's guaranteed floor is set aside on both sides
        # of the ratio, so the floor itself (equal-opportunity, not
        # rank-based) doesn't get mistaken for a ranking violation.
        ranked_need = max(a["need_l"] - floor, 0.0)
        ranked_allocated = max(a["allocated_l"] - floor, 0.0)
        pct_ranked = round((ranked_allocated / ranked_need) * 100, 1) if ranked_need > 0 else 100.0
        rows.append({"flat_id": a["flat_id"], "score": score, "pct_ranked": pct_ranked})

    rows.sort(key=lambda r: -r["score"])
    distinct_scores = sorted(set(r["score"] for r in rows), reverse=True)
    print(f"[Fairness check] {len(distinct_scores)} distinct vulnerability score levels present.")
    print("  Average % of RANKED (post-floor) need served, by score band (top 5 / bottom 5):")
    band_avg = {}
    for r in rows:
        band_avg.setdefault(r["score"], []).append(r["pct_ranked"])
    for s in distinct_scores[:5]:
        v = band_avg[s]
        print(f"    score {s:>5}: avg {sum(v)/len(v):.1f}% (n={len(v)})")
    print("    ...")
    for s in distinct_scores[-5:]:
        v = band_avg[s]
        print(f"    score {s:>5}: avg {sum(v)/len(v):.1f}% (n={len(v)})")

    print("\nChecking for score inversions on the RANKED portion (post-floor)...")
    inversions = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b = rows[i], rows[j]
            if a["score"] > b["score"] and a["pct_ranked"] < b["pct_ranked"] - 2:
                inversions.append((a["flat_id"], a["score"], b["flat_id"], b["score"]))

    if inversions:
        print(f"  {len(inversions)} potential inversion(s) found:")
        for a_id, a_score, b_id, b_score in inversions[:20]:
            print(f"    {a_id} (score {a_score}) served worse than {b_id} (score {b_score})")
        if len(inversions) > 20:
            print(f"    ...and {len(inversions) - 20} more")
    else:
        print("  None found - vulnerability ranking is respected across all levels (above the floor).")

    print(f"\n=== Overall: {'PASS' if conservation_ok and feasibility_ok and floor_ok and not inversions else 'REVIEW NEEDED'} ===")


if __name__ == "__main__":
    verify_allocation()

