# Water Allocation Engine — Hackathon Backend

Fairness-weighted Max-Flow Min-Cut allocation for 12 flats sharing a limited
water supply, with an explainable `reason` string per allocation and a
crisis-simulation toggle.

## Setup (run once)

```bash
pip install -r requirements.txt
cp .env.example .env
# open .env and fill in your real MongoDB Atlas connection string
```

## Seed the database

```bash
python seed.py
```
Expected output: `Inserted 12 flats...` and `Inserted system_state doc...`

## Run the API

```bash
uvicorn main:app --reload
```

## Test it

```bash
curl http://127.0.0.1:8000/flats
curl http://127.0.0.1:8000/system-status
curl -X POST http://127.0.0.1:8000/allocate
curl http://127.0.0.1:8000/allocation-log

# Demo flow: trigger crisis, re-run allocation, watch it reshuffle
curl -X POST http://127.0.0.1:8000/crisis/trigger
curl -X POST http://127.0.0.1:8000/allocate

# Reset for the next demo run
curl -X POST http://127.0.0.1:8000/crisis/reset
```

## Files

| File | Purpose |
|---|---|
| `seed_data.json` | 12 flats + the singleton `system_state` doc |
| `seed.py` | Wipes and reseeds MongoDB from `seed_data.json` |
| `engine.py` | Water-filling + Max-Flow Min-Cut allocation algorithm |
| `main.py` | FastAPI app — all HTTP endpoints |
| `.env.example` | Template for your Mongo credentials — copy to `.env`, never commit `.env` |
| `requirements.txt` | Python dependencies |

## Data flow

`seed.py` → MongoDB (`flats`, `system_state`) → `main.py` fetches on each
request → `engine.py` computes allocations → written to `allocation_log` →
returned to the frontend.
