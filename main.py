"""
FastAPI backend for the water allocation hackathon project.

Run:
    uvicorn main:app --reload

Endpoints:
    Public / read (any logged-in role):
        GET  /flats                    -> all flats, current state
        GET  /flats/{flat_id}          -> one flat (used by the user dashboard)
        GET  /system-status            -> the singleton system_state doc (master tank)
        GET  /sub-tanks                -> all sub-tank definitions
        GET  /allocation-log           -> latest logged allocations (optional ?flat_id=)
        GET  /config                   -> current live algorithm constants

    Allocation:
        POST /allocate                 -> single-tank allocation (flat-only mode)
        POST /allocate/hierarchical    -> two-level: master -> sub-tanks -> flats
        POST /crisis/trigger           -> halves available supply + flips status to "crisis"
        POST /crisis/reset             -> restores supply to normal

    Auth:
        POST /auth/login               -> {username, password} -> user + role

    Admin only:
        POST /users                    -> create a login (admin/manager/user)
        GET  /users                    -> list all logins
        PUT  /config                   -> tune algorithm constants (persisted + applied live)
        POST /config/reset             -> restore verified defaults
        POST /sub-tanks/assign         -> assign a flat to a sub-tank (tank hierarchy)

    Admin or Manager:
        GET  /emergency-requests       -> list emergency water requests (optional ?status=)
        POST /emergency-requests/{id}/approve
        POST /emergency-requests/{id}/reject

    Any logged-in user:
        POST /emergency-requests       -> submit an emergency water request for a flat

NOTE ON AUTH: this is a hackathon-appropriate simplification, not a
production-secure scheme. Login checks a sha256 password hash and the
frontend then sends the returned user_id/role back on every request via
X-User-Id / X-Role headers, which protected endpoints trust at face value.
There is no session expiry, token signing, or request tampering protection.
Good enough to demo three distinct roles; not something to deploy as-is.
"""

import os
import hashlib
from datetime import datetime, timezone

import certifi
from bson import ObjectId
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv

from engine import (
    run_allocation,
    run_hierarchical_allocation,
    get_config,
    set_config,
    reset_config,
)

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "water_allocation")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

app = FastAPI(title="Water Allocation Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _no_id(doc):
    """Strip Mongo's _id so responses are clean JSON for the frontend."""
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


def _hash_password(password: str) -> str:
    """
    sha256, no per-user salt. Fine for a hackathon demo login; NOT how you'd
    store real passwords in production (use bcrypt/argon2 with a salt there).
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_role(allowed_roles):
    """
    Reads X-Role / X-User-Id headers (set by the frontend after login) and
    rejects the request if the role isn't allowed. See the auth note above -
    this trusts the header, it does not cryptographically verify identity.
    """
    def _check(x_role: str = Header(default=None), x_user_id: str = Header(default=None)):
        if x_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"This action requires role: {' or '.join(allowed_roles)}",
            )
        return {"role": x_role, "user_id": x_user_id}
    return _check


def _apply_live_config():
    """Loads any admin-saved config from Mongo and applies it to the engine
    before an allocation run. If nothing's been saved yet, the engine's
    verified defaults stay in effect untouched."""
    config_doc = db.config.find_one({})
    if config_doc:
        cfg = {k: v for k, v in config_doc.items() if k != "_id"}
        try:
            set_config(cfg)
        except ValueError:
            pass  # stored config should already be valid; never let a bad
                   # stored value crash a live allocation run


def _apply_approved_emergencies(flats: list) -> list:
    """
    Marks flats with an approved-but-not-yet-fulfilled emergency request as
    emergency_active=True IN MEMORY ONLY (never written to the flat's own
    document) so this cycle's allocation gives them the same dominant
    priority as a medical flag. Returns the request docs so the caller can
    mark them fulfilled once the allocation that used them is done.
    """
    approved = list(db.emergency_requests.find({"status": "approved"}))
    approved_flat_ids = {r["flat_id"] for r in approved}
    for f in flats:
        if f["flat_id"] in approved_flat_ids:
            f["emergency_active"] = True
    return approved


def _fulfill_emergencies(approved_requests: list):
    for r in approved_requests:
        db.emergency_requests.update_one(
            {"_id": r["_id"]},
            {"$set": {"status": "fulfilled", "resolved_at": _now_iso()}},
        )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/auth/login")
def login(payload: dict):
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password are required")

    user = db.users.find_one({"username": username})
    if not user or user["password_hash"] != _hash_password(password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "user_id": str(user["_id"]),
        "username": user["username"],
        "name": user.get("name", user["username"]),
        "role": user["role"],
        "flat_id": user.get("flat_id"),
    }


@app.post("/users")
def create_user(payload: dict, _auth=Depends(require_role(["admin"]))):
    username = payload.get("username")
    password = payload.get("password")
    role = payload.get("role")
    name = payload.get("name") or username
    flat_id = payload.get("flat_id")

    if not username or not password or role not in ("admin", "manager", "user"):
        raise HTTPException(status_code=400, detail="username, password, and a valid role are required")
    if role == "user" and not flat_id:
        raise HTTPException(status_code=400, detail="flat_id is required when role is 'user'")
    if role == "user" and not db.flats.find_one({"flat_id": flat_id}):
        raise HTTPException(status_code=404, detail=f"No flat with id {flat_id}")
    if db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="That username is already taken")

    doc = {"username": username, "password_hash": _hash_password(password), "role": role, "name": name}
    if role == "user":
        doc["flat_id"] = flat_id

    result = db.users.insert_one(doc)
    return {"user_id": str(result.inserted_id), "username": username, "role": role, "name": name, "flat_id": flat_id}


@app.get("/users")
def list_users(_auth=Depends(require_role(["admin"]))):
    users = []
    for u in db.users.find({}):
        users.append({
            "user_id": str(u["_id"]),
            "username": u["username"],
            "name": u.get("name", u["username"]),
            "role": u["role"],
            "flat_id": u.get("flat_id"),
        })
    return {"users": users, "count": len(users)}


# ---------------------------------------------------------------------------
# Flats / system status / sub-tanks (read)
# ---------------------------------------------------------------------------

@app.get("/flats")
def get_flats():
    flats = [_no_id(f) for f in db.flats.find({})]
    return {"flats": flats, "count": len(flats)}


@app.get("/flats/{flat_id}")
def get_flat(flat_id: str):
    flat = _no_id(db.flats.find_one({"flat_id": flat_id}))
    if not flat:
        raise HTTPException(status_code=404, detail=f"No flat with id {flat_id}")
    return flat


@app.get("/system-status")
def get_system_status():
    state = _no_id(db.system_state.find_one({}))
    if not state:
        raise HTTPException(status_code=404, detail="system_state not seeded yet — run seed.py")
    return state


@app.get("/sub-tanks")
def get_sub_tanks():
    sub_tanks = [_no_id(st) for st in db.sub_tanks.find({})]
    return {"sub_tanks": sub_tanks, "count": len(sub_tanks)}


@app.post("/sub-tanks/assign")
def assign_flat_to_subtank(payload: dict, _auth=Depends(require_role(["admin"]))):
    flat_id = payload.get("flat_id")
    sub_tank_id = payload.get("sub_tank_id")
    if not flat_id or not sub_tank_id:
        raise HTTPException(status_code=400, detail="flat_id and sub_tank_id are required")
    if not db.sub_tanks.find_one({"sub_tank_id": sub_tank_id}):
        raise HTTPException(status_code=404, detail=f"No sub-tank with id {sub_tank_id}")

    result = db.flats.update_one({"flat_id": flat_id}, {"$set": {"sub_tank_id": sub_tank_id}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"No flat with id {flat_id}")
    return _no_id(db.flats.find_one({"flat_id": flat_id}))


# ---------------------------------------------------------------------------
# Algorithm config (admin-tunable constants)
# ---------------------------------------------------------------------------

@app.get("/config")
def get_config_endpoint():
    return get_config()


@app.put("/config")
def update_config_endpoint(payload: dict, _auth=Depends(require_role(["admin"]))):
    try:
        updated = set_config(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.config.delete_many({})
    db.config.insert_one(dict(updated))
    return updated


@app.post("/config/reset")
def reset_config_endpoint(_auth=Depends(require_role(["admin"]))):
    updated = reset_config()
    db.config.delete_many({})
    db.config.insert_one(dict(updated))
    return updated


# ---------------------------------------------------------------------------
# Add water to master tank
# ---------------------------------------------------------------------------

@app.post("/water/add")
def add_water(
    payload: dict,
    _auth=Depends(require_role(["admin"]))
):
    amount = payload.get("amount_l")

    if amount is None:
        raise HTTPException(
            status_code=400,
            detail="amount_l is required"
        )

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="amount_l must be a number"
        )

    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Water amount must be greater than 0"
        )

    state = db.system_state.find_one({})

    if not state:
        raise HTTPException(
            status_code=404,
            detail="system_state not seeded yet"
        )

    current_supply = float(
        state.get("available_supply_l", 0)
    )

    capacity = float(
        state.get("capacity_l", 0)
    )

    # Add water without exceeding tank capacity
    new_supply = min(
        capacity,
        current_supply + amount
    )

    # Automatically determine status
    if new_supply <= capacity * 0.50:
        status = "crisis"
    else:
        status = "normal"

    db.system_state.update_one(
        {},
        {
            "$set": {
                "available_supply_l": round(new_supply, 2),
                "status": status
            }
        }
    )

    return _no_id(
        db.system_state.find_one({})
    )

# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------

@app.post("/allocate")
def allocate():
    _apply_live_config()

    flats = [_no_id(f) for f in db.flats.find({})]
    system_state = _no_id(db.system_state.find_one({}))

    if not flats or not system_state:
        raise HTTPException(
            status_code=404,
            detail="Data not seeded yet — run seed.py first"
        )

    # Apply approved emergency requests
    approved = _apply_approved_emergencies(flats)

    # Run allocation
    result = run_allocation(flats, system_state)

    # =====================================================
    # UPDATE MASTER WATER SUPPLY
    # =====================================================

    allocated = result.get("total_allocated_l", 0)

    remaining_supply = max(
        0,
        system_state["available_supply_l"] - allocated
    )

    # =====================================================
    # AUTOMATICALLY DETERMINE CRISIS STATUS
    # =====================================================

    if remaining_supply <= system_state["capacity_l"] * 0.50:
        status = "crisis"
    else:
        status = "normal"

    # Save updated supply + status
    db.system_state.update_one(
        {},
        {
            "$set": {
                "available_supply_l": remaining_supply,
                "status": status
            }
        }
    )

    # =====================================================
    # SAVE ALLOCATION LOG
    # =====================================================

    db.allocation_log.delete_many({})

    for entry in result["allocations"]:
        db.allocation_log.insert_one(dict(entry))
    # Update flat tank levels with allocated water
    for entry in result["allocations"]:
        flat_id = entry["flat_id"]
        allocated_l = entry.get("allocated_l", 0)

        flat = db.flats.find_one({"flat_id": flat_id})

        if flat and allocated_l > 0:
            capacity = flat.get("tank_capacity_l", 0)
            current_pct = flat.get("tank_level_pct", 0)

            current_l = (current_pct / 100) * capacity
            new_l = min(capacity, current_l + allocated_l)

            new_pct = (new_l / capacity) * 100 if capacity > 0 else 0

            db.flats.update_one(
                {"flat_id": flat_id},
                {
                    "$set": {
                        "tank_level_pct": round(new_pct, 2)
                    }
                }
            )

    # Fulfill approved emergency requests
    _fulfill_emergencies(approved)

    # Return updated supply/status to frontend
    result["remaining_supply_l"] = remaining_supply
    result["status"] = status

    return result


@app.get("/allocation-log")
def get_allocation_log(flat_id: str = None):
    query = {"flat_id": flat_id} if flat_id else {}
    log = [_no_id(entry) for entry in db.allocation_log.find(query)]
    return {"log": log, "count": len(log)}


@app.post("/crisis/trigger")
def trigger_crisis():
    state = db.system_state.find_one({})

    if not state:
        raise HTTPException(
            status_code=404,
            detail="system_state not seeded yet"
        )

    # Only change the mode.
    # Do NOT change available_supply_l.
    db.system_state.update_one(
        {},
        {"$set": {"status": "crisis"}}
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


@app.post("/allocate/hierarchical")
def allocate_hierarchical():
    _apply_live_config()

    flats = [_no_id(f) for f in db.flats.find({})]
    sub_tanks = [_no_id(st) for st in db.sub_tanks.find({})]
    master_state = _no_id(db.system_state.find_one({}))

    if not flats or not sub_tanks or not master_state:
        raise HTTPException(
            status_code=404,
            detail="Data not seeded yet — run seed.py first"
        )

    # ==========================================
    # APPLY APPROVED EMERGENCY REQUESTS
    # ==========================================

    approved = _apply_approved_emergencies(flats)

    # ==========================================
    # GROUP FLATS BY SUB-TANK
    # ==========================================

    flats_by_subtank = {}

    for f in flats:
        flats_by_subtank.setdefault(
            f.get("sub_tank_id"), []
        ).append(f)

    # ==========================================
    # RUN HIERARCHICAL ALLOCATION
    # Master Tank → Sub-Tanks → Flats
    # ==========================================

    result = run_hierarchical_allocation(
        master_state,
        sub_tanks,
        flats_by_subtank
    )

    # ==========================================
    # SAVE FLAT ALLOCATIONS
    # ==========================================

    db.allocation_log.delete_many({})

    for stid, sub_result in result["flat_allocation_by_subtank"].items():

        for entry in sub_result["allocations"]:

            entry_with_tank = dict(entry)
            entry_with_tank["sub_tank_id"] = stid

            db.allocation_log.insert_one(entry_with_tank)

    # ==========================================
    # UPDATE FLAT TANK LEVELS
    # ==========================================

    for stid, sub_result in result["flat_allocation_by_subtank"].items():

        for entry in sub_result["allocations"]:

            flat_id = entry["flat_id"]
            allocated_l = entry.get("allocated_l", 0)

            flat = db.flats.find_one({
                "flat_id": flat_id
            })

            if flat and allocated_l > 0:

                capacity = flat.get("tank_capacity_l", 0)
                current_pct = flat.get("tank_level_pct", 0)

                # Convert current percentage to litres
                current_l = (current_pct / 100) * capacity

                # Add newly allocated water
                new_l = min(
                    capacity,
                    current_l + allocated_l
                )

                # Convert back to percentage
                new_pct = (
                    (new_l / capacity) * 100
                    if capacity > 0
                    else 0
                )

                # Save updated tank percentage
                db.flats.update_one(
                    {"flat_id": flat_id},
                    {
                        "$set": {
                            "tank_level_pct": round(new_pct, 2)
                        }
                    }
                )

    # ==========================================
    # REDUCE MASTER SUPPLY
    # ==========================================

    allocated = result["sub_tank_allocation"].get(
        "total_allocated_l",
        0
    )

    remaining_supply = max(
        0,
        master_state["available_supply_l"] - allocated
    )

    # ==========================================
    # AUTOMATIC CRISIS STATUS
    # Crisis when supply <= 50% of capacity
    # ==========================================

    if remaining_supply <= master_state["capacity_l"] * 0.50:
        status = "crisis"
    else:
        status = "normal"

    # ==========================================
    # UPDATE MASTER SUPPLY + STATUS
    # ==========================================

    db.system_state.update_one(
        {},
        {
            "$set": {
                "available_supply_l": remaining_supply,
                "status": status
            }
        }
    )

    # ==========================================
    # FULFILL APPROVED EMERGENCIES
    # ==========================================

    _fulfill_emergencies(approved)

    # ==========================================
    # RETURN UPDATED VALUES
    # ==========================================

    result["remaining_supply_l"] = remaining_supply
    result["master_status"] = status

    return result


# ---------------------------------------------------------------------------
# Emergency water requests
# ---------------------------------------------------------------------------

@app.post("/emergency-requests")
def create_emergency_request(payload: dict):
    flat_id = payload.get("flat_id")
    reason = payload.get("reason")
    requested_l = payload.get("requested_l")

    if not flat_id or not reason:
        raise HTTPException(status_code=400, detail="flat_id and reason are required")
    if not db.flats.find_one({"flat_id": flat_id}):
        raise HTTPException(status_code=404, detail=f"No flat with id {flat_id}")

    doc = {
        "flat_id": flat_id,
        "reason": reason,
        "requested_l": requested_l,
        "status": "pending",
        "created_at": _now_iso(),
        "resolved_at": None,
        "resolved_by": None,
    }
    result = db.emergency_requests.insert_one(doc)

    return {
        **_no_id(doc),
        "request_id": str(result.inserted_id)
    }


@app.get("/emergency-requests")
def list_emergency_requests(status: str = None, flat_id: str = None, _auth=Depends(require_role(["admin", "manager", "user"]))):
    query = {}
    if _auth["role"] == "user":
        # Users can only ever see requests for their OWN flat, looked up
        # server-side from their account - never trust a client-supplied
        # flat_id for this role, or a user could read another flat's requests.
        try:
            user_doc = db.users.find_one({"_id": ObjectId(_auth["user_id"])})
        except Exception:
            user_doc = None
        if not user_doc or not user_doc.get("flat_id"):
            raise HTTPException(status_code=403, detail="No flat is linked to this account")
        query["flat_id"] = user_doc["flat_id"]
    elif flat_id:
        query["flat_id"] = flat_id
    if status:
        query["status"] = status

    requests = []
    for r in db.emergency_requests.find(query):
        requests.append({**_no_id(r), "request_id": str(r["_id"])})
    return {"requests": requests, "count": len(requests)}


@app.post("/emergency-requests/{request_id}/approve")
def approve_emergency_request(request_id: str, _auth=Depends(require_role(["admin", "manager"]))):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request_id")

    req = db.emergency_requests.find_one({"_id": oid})
    if not req:
        raise HTTPException(status_code=404, detail="Emergency request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req['status']}")

    db.emergency_requests.update_one(
        {"_id": oid},
        {"$set": {"status": "approved", "resolved_at": _now_iso(), "resolved_by": _auth["user_id"]}},
    )
    return {"request_id": request_id, "status": "approved"}


@app.post("/emergency-requests/{request_id}/reject")
def reject_emergency_request(request_id: str, _auth=Depends(require_role(["admin", "manager"]))):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request_id")

    req = db.emergency_requests.find_one({"_id": oid})
    if not req:
        raise HTTPException(status_code=404, detail="Emergency request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req['status']}")

    db.emergency_requests.update_one(
        {"_id": oid},
        {"$set": {"status": "rejected", "resolved_at": _now_iso(), "resolved_by": _auth["user_id"]}},
    )
    return {"request_id": request_id, "status": "rejected"}