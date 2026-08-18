import duckdb
from duckdb import DuckDBPyConnection

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data_acquisition.config import config
from pathlib import Path

DB_LT_SNAPSHOT_PATH = Path(config.DB_LONGTERM_SNAPSHOT_PATH).resolve()
DB_ST_SNAPSHOT_PATH = Path(config.DB_SHORTTERM_SNAPSHOT_PATH).resolve()

app = FastAPI(title="SkyCharts API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

def query(snapshot_path: Path, sql: str, params: list | None = None) -> list[dict]:
    """
    Query a database and return rows as dicts

    Args:
        snapshot_path (Path): Path to a database's snapshot
        sql (str): SQL query to execute
        params (list | None): To pass into query
    """
    if not snapshot_path.exists():
        raise HTTPException(status_code=503, detail="No data snapshot published yet")

    db = duckdb.connect(snapshot_path, read_only=True)
    try:
        return db.execute(sql, params or []) \
                .fetch_df() \
                .to_dict(orient="records")
    finally:
        db.close()

@app.get("/products")
def list_products() -> list[str]:
    """All distinct product names seen in the long-term DB snapshot"""
    names: set[str] = set()
    rows = query(DB_LT_SNAPSHOT_PATH, "SELECT DISTINCT name FROM bazaar_data")
    names.update(row["name"] for row in rows)
    return sorted(names)

@app.get("/history")
def product_histories(
    names: list[str] = Query(...),
    start_ms: int = Query(..., ge=0),
    end_ms: int = Query(..., ge=0),
) -> dict[str, list[dict]]:
    """
    Get data for several products between two given times.
 
    Args:
        name (str): Identifier string for the product
        start_ms (int): Lower bound as milliseconds since epoch
        end_ms (int): Upper bound as milliseconds since epoch
    
    Returns:
        A dictionary mapping a product name to a list of data records
    """
    unique_names = sorted(set(names))
    if not unique_names:
        raise HTTPException(status_code=422, detail="At least one name is required")
    
    range_seconds = (end_ms - start_ms) / 1000.0
    if range_seconds <= config.DATA_SHORTTERM_LIFETIME:
        snapshot_path = DB_ST_SNAPSHOT_PATH
    else:
        snapshot_path = DB_LT_SNAPSHOT_PATH

    placeholders = ", ".join("?" for _ in unique_names)
    sql = f"""
        SELECT name, time, sell_price, sell_volume, buy_price, buy_volume
        FROM bazaar_data
        WHERE name IN ({placeholders}) AND time >= ? AND time < ?
        ORDER BY name, time
    """
    rows = query(snapshot_path, sql, [*unique_names, start_ms, end_ms])
 
    histories: dict[str, list[dict]] = {name: [] for name in unique_names}
    for row in rows:
        histories[row.pop("name")].append(row)
    return histories