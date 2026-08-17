import duckdb
from duckdb import DuckDBPyConnection

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data_acquisition.config import config
from pathlib import Path

DB_LT_SNAPSHOT_PATH = Path(config.DB_LONGTERM_SNAPSHOT_PATH).resolve()
DB_ST_SNAPSHOT_PATH = Path(config.DB_SHORTTERM_SNAPSHOT_PATH).resolve()

# @asynccontextmanager
# async def connect_dbs(app: FastAPI):
#     """Connect to lt & st databases on startup and disconnect on close"""
#     db_lt = duckdb.connect(config.DB_LONGTERM_SNAPSHOT_PATH, read_only=True)
#     db_st = duckdb.connect(config.DB_SHORTTERM_SNAPSHOT_PATH, read_only=True)
#     app.state.db_lt = db_lt
#     app.state.db_st = db_st
#     yield
#     db_lt.close()
#     db_st.close()

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

@app.get("/products/{name}")
def product_data(
    name: str,
    start_ms: int = Query(..., ge=0),
    end_ms: int = Query(..., ge=0),
) -> list[dict]:
    """
    Get product data between two given times.
 
    Args:
        name (str): Identifier string for the product
        start_ms (int): Lower bound as milliseconds since epoch
        end_ms (int): Upper bound as milliseconds since epoch
    """
    range_seconds = (end_ms - start_ms) / 1000.0
    if range_seconds <= config.DATA_SHORTTERM_LIFETIME:
        snapshot_path = DB_ST_SNAPSHOT_PATH
    else:
        snapshot_path = DB_LT_SNAPSHOT_PATH
 
    sql = f"""
        SELECT time, sell_price, sell_volume, buy_price, buy_volume
        FROM bazaar_data
        WHERE name = ? AND time >= ? AND time < ?
        ORDER BY time
    """
    rows = query(snapshot_path, sql, [name, start_ms, end_ms])
 
    return rows