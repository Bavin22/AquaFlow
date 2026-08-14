"""
FastAPI backend for the water allocation hackathon project.

Run:
    uvicorn main:app --reload

Endpoints:
    GET  /flats             -> all 12 flats, current state
    GET  /system-status      -> the singleton system_state doc
    POST /allocate           -> runs the Max-Flow Min-Cut engine, logs + returns result
    GET  /allocation-log      -> latest logged allocations (for the dashboard)
    POST /crisis/trigger      -> halves available supply + flips status to "crisis"
    POST /crisis/reset        -> restores supply to normal, status back to "normal"
"""

import os
import certifi
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv

from engine import run_allocation

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

    # Log this run: clear old log entries and write the fresh reasoning per flat
    db.allocation_log.delete_many({})
    for entry in result["allocations"]:
        db.allocation_log.insert_one(dict(entry))

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
        {"$set": {"available_supply_l": 3000, "status": "normal"}},
    )
    return _no_id(db.system_state.find_one({}))
