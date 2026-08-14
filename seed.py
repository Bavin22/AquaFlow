"""
Seeds MongoDB Atlas with the flats, system_state, sub_tanks, default logins,
and default algorithm config from seed_data.json.
Run once (or any time you want to reset the DB back to a clean starting state):

    python seed.py

Default logins created (change these before any real demo/public use):
    admin   / admin123    (role: admin)
    manager / manager123  (role: manager)
    a sample user login is created per flat: username = flat_id.lower(),
    password = "password123"  (role: user)
"""

import hashlib
import json
import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

from engine import DEFAULT_CONFIG

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "water_allocation")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

with open("seed_data.json", "r") as f:
    data = json.load(f)


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# Wipe existing data so re-running this always gives a clean, predictable state
db.flats.delete_many({})
db.system_state.delete_many({})
db.allocation_log.delete_many({})
db.sub_tanks.delete_many({})
db.users.delete_many({})
db.config.delete_many({})
db.emergency_requests.delete_many({})

flats_result = db.flats.insert_many(data["flats"])
print(f"Inserted {len(flats_result.inserted_ids)} flats into '{DB_NAME}.flats'")

db.system_state.insert_one(data["system_state"])
print(f"Inserted system_state doc into '{DB_NAME}.system_state'")

if "sub_tanks" in data:
    subtanks_result = db.sub_tanks.insert_many(data["sub_tanks"])
    print(f"Inserted {len(subtanks_result.inserted_ids)} sub_tanks into '{DB_NAME}.sub_tanks'")

db.config.insert_one(dict(DEFAULT_CONFIG))
print(f"Inserted default algorithm config into '{DB_NAME}.config'")

users = [
    {"username": "admin", "password_hash": _hash_password("admin123"), "role": "admin", "name": "Admin"},
    {"username": "manager", "password_hash": _hash_password("manager123"), "role": "manager", "name": "Manager"},
]
for f in data["flats"]:
    users.append({
        "username": f["flat_id"].lower(),
        "password_hash": _hash_password("password123"),
        "role": "user",
        "name": f.get("name", f["flat_id"]),
        "flat_id": f["flat_id"],
    })
users_result = db.users.insert_many(users)
print(f"Inserted {len(users_result.inserted_ids)} user logins into '{DB_NAME}.users' "
      f"(admin/admin123, manager/manager123, one per flat e.g. f1/password123)")

# Create indexes for optimal query execution performance
print("Creating database indexes...")
db.flats.create_index("flat_id", unique=True)
db.flats.create_index("sub_tank_id")
db.sub_tanks.create_index("sub_tank_id", unique=True)
db.allocation_log.create_index("flat_id")
db.users.create_index("username", unique=True)
db.emergency_requests.create_index("flat_id")
db.emergency_requests.create_index("status")
print("Indexes created successfully.")

print("Seed complete. allocation_log and emergency_requests left empty.")