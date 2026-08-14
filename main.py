"""
FastAPI backend for the water allocation hackathon project.

Run:
    uvicorn main:app --reload

Endpoints:
    GET  /flats                  -> all flats, current state
    GET  /system-status           -> the singleton system_state doc (master tank)
    POST /allocate                -> single-tank allocation (flat-only mode)
    GET  /allocation-log           -> latest logged single-tank allocations
    POST /crisis/trigger           -> halves available supply + flips status to "crisis"
    POST /crisis/reset             -> restores supply to normal, status back to "normal"
    GET  /sub-tanks                -> all sub-tank definitions
    POST /allocate/hierarchical    -> two-level allocation: master -> sub-tanks -> flats
"""

import os
import certifi
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv

from engine import run_allocation, run_hierarchical_allocation
from pydantic import BaseModel

class SimulationRequest(BaseModel):
    scenarios: list[float] = None

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "water_allocation")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

app = FastAPI(title="Water Allocation Engine")

# Allow the React frontend (any localhost port) to call this API during the hackathon
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _no_id(doc):
    """Strip Mongo's _id so responses are clean JSON for the frontend."""
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


@app.get("/flats")
def get_flats():
    flats = [_no_id(f) for f in db.flats.find({})]
    return {"flats": flats, "count": len(flats)}


@app.get("/system-status")
def get_system_status():
    state = _no_id(db.system_state.find_one({}))
    if not state:
        raise HTTPException(status_code=404, detail="system_state not seeded yet — run seed.py")
    return state


@app.post("/allocate")
def allocate():
    flats = [_no_id(f) for f in db.flats.find({})]
    system_state = _no_id(db.system_state.find_one({}))

    if not flats or not system_state:
        raise HTTPException(status_code=404, detail="Data not seeded yet — run seed.py first")

    result = run_allocation(flats, system_state)

    # Log this run: clear old log entries and write the fresh reasoning per flat using optimized bulk insert_many
    db.allocation_log.delete_many({})
    if result["allocations"]:
        db.allocation_log.insert_many([dict(entry) for entry in result["allocations"]])

    return result


@app.get("/allocation-log")
def get_allocation_log():
    log = [_no_id(entry) for entry in db.allocation_log.find({})]
    return {"log": log, "count": len(log)}


@app.post("/crisis/trigger")
def trigger_crisis():
    """The 'money shot' button — halves supply and flips status to crisis."""
    state = db.system_state.find_one({})
    if not state:
        raise HTTPException(status_code=404, detail="system_state not seeded yet")

    new_supply = round(state["available_supply_l"] / 2, 2)
    db.system_state.update_one(
        {},
        {"$set": {"available_supply_l": new_supply, "status": "crisis"}},
    )
    return _no_id(db.system_state.find_one({}))


@app.post("/crisis/reset")
def reset_crisis():
    """Restore supply back to a normal baseline for re-demoing."""
    db.system_state.update_one(
        {},
        {"$set": {"available_supply_l": 28000, "status": "normal"}},
    )
    return _no_id(db.system_state.find_one({}))


@app.get("/sub-tanks")
def get_sub_tanks():
    sub_tanks = [_no_id(st) for st in db.sub_tanks.find({})]
    return {"sub_tanks": sub_tanks, "count": len(sub_tanks)}


@app.post("/allocate/hierarchical")
def allocate_hierarchical():
    """
    Two-level allocation: the master tank (system_state) distributes across
    sub-tanks by their dependents' cumulative vulnerability, then each
    sub-tank distributes what IT received across its own flats - same
    run_allocation() logic at both levels, see engine.run_hierarchical_allocation.
    """
    flats = [_no_id(f) for f in db.flats.find({})]
    sub_tanks = [_no_id(st) for st in db.sub_tanks.find({})]
    master_state = _no_id(db.system_state.find_one({}))

    if not flats or not sub_tanks or not master_state:
        raise HTTPException(status_code=404, detail="Data not seeded yet — run seed.py first")

    flats_by_subtank = {}
    for f in flats:
        flats_by_subtank.setdefault(f.get("sub_tank_id"), []).append(f)

    result = run_hierarchical_allocation(master_state, sub_tanks, flats_by_subtank)

    # Log every flat-level allocation across all sub-tanks in one place,
    # tagged with which sub-tank it came from, using optimized bulk insert_many.
    db.allocation_log.delete_many({})
    entries = []
    for stid, sub_result in result["flat_allocation_by_subtank"].items():
        for entry in sub_result["allocations"]:
            entry_with_tank = dict(entry)
            entry_with_tank["sub_tank_id"] = stid
            entries.append(entry_with_tank)
            
    if entries:
        db.allocation_log.insert_many(entries)

    return result


@app.get("/forecast")
def get_forecast():
    flats = [_no_id(f) for f in db.flats.find({})]
    system_state = _no_id(db.system_state.find_one({}))
    if not flats or not system_state:
        raise HTTPException(status_code=404, detail="Data not seeded yet")
        
    from engine import forecast_demand
    predicted = forecast_demand(flats)
    available = system_state["available_supply_l"]
    shortage = max(0.0, predicted - available)
    
    return {
        "predicted_demand_l": predicted,
        "available_supply_l": available,
        "predicted_shortage_l": round(shortage, 2),
        "status": "shortage_warning" if shortage > 0 else "adequate"
    }


@app.post("/simulate")
def simulate(req: SimulationRequest = None):
    flats = [_no_id(f) for f in db.flats.find({})]
    system_state = _no_id(db.system_state.find_one({}))
    if not flats or not system_state:
        raise HTTPException(status_code=404, detail="Data not seeded yet")
        
    scenarios = req.scenarios if req and req.scenarios else None
    if not scenarios:
        scenarios = [5000.0, 10000.0, 15000.0, 20000.0, 25000.0, 30000.0]
        
    results = {}
    for supply in scenarios:
        sim_state = dict(system_state)
        sim_state["available_supply_l"] = supply
        if supply < 18000:
            sim_state["status"] = "crisis"
        else:
            sim_state["status"] = "normal"
            
        from engine import run_allocation
        alloc_res = run_allocation(flats, sim_state)
        
        total_need = alloc_res["total_need_l"]
        total_allocated = alloc_res["total_allocated_l"]
        coverage_pct = round((total_allocated / total_need) * 100, 1) if total_need > 0 else 100.0
        
        floors_met = sum(1 for a in alloc_res["allocations"] if a["allocated_l"] >= a["survival_floor_l"] - 0.01)
        shortfall_count = sum(1 for a in alloc_res["allocations"] if a["allocated_l"] < a["need_l"] - 0.01)
        
        results[str(int(supply))] = {
            "supply_l": supply,
            "total_allocated_l": total_allocated,
            "coverage_pct": coverage_pct,
            "survival_floor_coverage_pct": round((floors_met / len(flats)) * 100, 1),
            "shortfall_count": shortfall_count,
            "jains_fairness_index": alloc_res["jains_fairness_index"],
            "gini_coefficient": alloc_res["gini_coefficient"],
            "system_reserve_l": alloc_res["system_reserve_l"]
        }
        
    return {"scenarios": results}