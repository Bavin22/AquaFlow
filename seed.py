"""
Seeds MongoDB Atlas with the 12 flats + system_state singleton from seed_data.json.
Run once (or any time you want to reset the DB back to a clean starting state):

    python seed.py
"""

import json
import os
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "water_allocation")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

with open("seed_data.json", "r") as f:
    data = json.load(f)

# Wipe existing data so re-running this always gives a clean, predictable state
db.flats.delete_many({})
db.system_state.delete_many({})
db.allocation_log.delete_many({})

flats_result = db.flats.insert_many(data["flats"])
print(f"Inserted {len(flats_result.inserted_ids)} flats into '{DB_NAME}.flats'")

db.system_state.insert_one(data["system_state"])
print(f"Inserted system_state doc into '{DB_NAME}.system_state'")

print("Seed complete. allocation_log left empty — it fills up as you call /allocate.")

