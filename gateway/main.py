import duckdb

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from data_acquisition.config import config
from pathlib import Path

app = FastAPI(title="SkyCharts API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

DATA_FILES_GLOB = str(Path(config.DATA_DIR_PATH) / "**" / "*.parquet")

def query(sql: str, params: list | None = None) -> list[dict]:
    """Query dataset and return rows as dicts"""
    con = duckdb.connect()
    # execute w/ params, convert to df, convert to list of records
    return con.execute(sql, params or []) \
              .fetch_df() \
              .to_dict(orient="records")

@app.get("/")
async def root():
    return { "message" : "hi from laptop" }