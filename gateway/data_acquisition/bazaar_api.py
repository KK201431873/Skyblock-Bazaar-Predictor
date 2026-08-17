import pandas as pd
import numpy as np
import requests
import logging
import duckdb
import os
import stat
import time
import shutil

from duckdb import DuckDBPyConnection
from datetime import datetime, timezone
from data_acquisition.config import config
from pathlib import Path
from enum import Enum

logger = logging.getLogger("bazaar_api")
logger.setLevel(logging.INFO)

DATA_LT_DIR_PATH = Path(config.DATA_LONGTERM_DIR_PATH).resolve()
DATA_ST_DIR_PATH = Path(config.DATA_SHORTTERM_DIR_PATH).resolve()

DB_LT_PATH = Path(config.DB_LONGTERM_PATH).resolve()
DB_ST_PATH = Path(config.DB_SHORTTERM_PATH).resolve()

DB_LT_PATH.parent.mkdir(parents=True, exist_ok=True)
DB_ST_PATH.parent.mkdir(parents=True, exist_ok=True)

DB_LT_SNAPSHOT_PATH = Path(config.DB_LONGTERM_SNAPSHOT_PATH).resolve()
DB_ST_SNAPSHOT_PATH = Path(config.DB_SHORTTERM_SNAPSHOT_PATH).resolve()

class DBType(Enum):
    """Descriptor for the type of data. Affects where data is stored"""
    LONG_TERM = 1
    SHORT_TERM = 2

class BazaarAPI:
    """Manages bazaar data collection."""

    db_lt: DuckDBPyConnection
    db_st: DuckDBPyConnection

    def __init__(self):
        self.db_lt = duckdb.connect(DB_LT_PATH)
        self.db_st = duckdb.connect(DB_ST_PATH)
        logger.info(f"Opened connection to databases")

        self._init_schema(self.db_lt)
        self._init_schema(self.db_st)

        self._backfill_dir(self.db_lt, DATA_LT_DIR_PATH)
        self._backfill_dir(self.db_st, DATA_ST_DIR_PATH)
        self.prune_short_term_data(int(time.time() * 1000))
        
        self.snapshot_db(DBType.LONG_TERM)
        self.snapshot_db(DBType.SHORT_TERM)

    def close(self) -> None:
        """Close database connections"""
        logger.info(f"Closing connection to databases...")
        self.db_lt.close()
        self.db_st.close()

    def _init_schema(self, db: DuckDBPyConnection) -> None:
        """
        Create tables to keep db & parquet files matched

        `bazaar_data` mirrors the rows written to parquet.
        `ingested_files` tracks which parquet files have been loaded.

        Args:
            conn (DuckDBPyConnection): The database to initialize
        """
        db.execute("""
            CREATE TABLE IF NOT EXISTS bazaar_data (
                time                BIGINT NOT NULL,
                name                VARCHAR NOT NULL,
                sell_price          FLOAT,
                sell_volume         INTEGER,
                sell_moving_week    INTEGER,
                sell_orders         SMALLINT,
                buy_price           FLOAT,
                buy_volume          INTEGER,
                buy_moving_week     INTEGER,
                buy_orders          SMALLINT
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_bazaar_data_time ON bazaar_data(time)")

        db.execute("""
            CREATE TABLE IF NOT EXISTS ingested_files (
                file_path VARCHAR PRIMARY KEY
            )
        """)

    def _backfill_dir(self, db: DuckDBPyConnection, dir_path: Path) -> None:
        """
        Load missing parquets into the given database
        
        Args:
            conn (DuckDBPyConnection): The database to update
            dir_path (Path): Path to the dir of parquet files to update the db with
        """
        if not dir_path.exists():
            return

        all_files = sorted(dir_path.glob("date=*/*.parquet"))
        if not all_files:
            return

        known = {row[0] for row in db.execute("SELECT file_path FROM ingested_files").fetchall()}
        missing = [f for f in all_files if str(f) not in known]  # directory diff

        if not missing:
            logger.info(f"No files to backfill in {dir_path}")
            return

        try:
            db.execute("BEGIN TRANSACTION")
            for f in missing:
                db.execute("""
                    INSERT INTO bazaar_data
                    SELECT
                        time, name, sell_price, sell_volume, sell_moving_week,
                        sell_orders, buy_price, buy_volume, buy_moving_week, buy_orders
                    FROM read_parquet(?)
                """, [str(f)])
                db.execute("INSERT INTO ingested_files VALUES (?)", [str(f)])
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise

        logger.info(f"Backfilled {len(missing)} files from {dir_path}")
        
    def snapshot_db(self, db_type: DBType) -> None:
        """
        Create a readable copy of the specified database.

        Args:
            db_type (DBType): Which database to snapshot
        """
        match db_type:
            case DBType.LONG_TERM:
                db = self.db_lt
                src_path = DB_LT_PATH
                snapshot_path = DB_LT_SNAPSHOT_PATH
            case DBType.SHORT_TERM:
                db = self.db_st
                src_path = DB_ST_PATH
                snapshot_path = DB_ST_SNAPSHOT_PATH
        
        db.execute("CHECKPOINT")
        db.close()
 
        tmp_path = snapshot_path.with_suffix(snapshot_path.suffix + ".tmp")
        shutil.copy2(src_path, tmp_path)
        os.replace(tmp_path, snapshot_path)

        match db_type:
            case DBType.LONG_TERM:
                self.db_lt = duckdb.connect(DB_LT_PATH)
            case DBType.SHORT_TERM:
                self.db_st = duckdb.connect(DB_ST_PATH)

    def get_latest_data(self) -> tuple[int, pd.DataFrame]:
        """
        Fetch the latest data from the Hypixel API.
        
        Returns:
            time (int): Timestamp in milliseconds since epoch
            products (pd.DataFrame | None): Contains timestamped data for all products, or None if an error occurred
        """
        try:
            r = requests.get(config.BAZAAR_API_URL, timeout=5)
            r.raise_for_status()

            # organize data into pandas dataframe
            data_raw: dict = r.json()
            products_raw: dict[str, dict] = data_raw["products"]
            time = int(data_raw["lastUpdated"])

            records = [
                {
                    "time"              : np.int64(time),
                    "name"              : key,
                    "sell_price"        : np.float32(product_info["quick_status"]["sellPrice"]),
                    "sell_volume"       : np.int32(product_info["quick_status"]["sellVolume"]),
                    "sell_moving_week"  : np.int32(product_info["quick_status"]["sellMovingWeek"]),
                    "sell_orders"       : np.int16(product_info["quick_status"]["sellOrders"]),
                    "buy_price"         : np.float32(product_info["quick_status"]["buyPrice"]),
                    "buy_volume"        : np.int32(product_info["quick_status"]["buyVolume"]),
                    "buy_moving_week"   : np.int32(product_info["quick_status"]["buyMovingWeek"]),
                    "buy_orders"        : np.int16(product_info["quick_status"]["buyOrders"]),
                }
                for key, product_info in products_raw.items()
            ]

            df = pd.DataFrame.from_records(records)
            df = df.astype({
                "time"              : "int64",
                "sell_price"        : "float32",
                "sell_volume"       : "int32",
                "sell_moving_week"  : "int32",
                "sell_orders"       : "int16",
                "buy_price"         : "float32",
                "buy_volume"        : "int32",
                "buy_moving_week"   : "int32",
                "buy_orders"        : "int16",
            })
            df["name"] = df["name"].astype("category")

            return time, df
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            logging.error("Failed to connect to Hypixel API")
        except requests.exceptions.HTTPError as e:
            logging.error(f"Bad response code {e}")
        except Exception as e:
            logging.error(f"Unexpected error: {e}")
        return -1, pd.DataFrame()

    def write_data_frame(self, time: int, df: pd.DataFrame, type: DBType) -> None:
        """
        Write one data frame to parquet dataset.
        
        Args:
            time (int): Timestamp in milliseconds since epoch
            frame (pd.DataFrame): Data frame to write
            type (DBType): What kind of data is being written
        """
        date_str = datetime.fromtimestamp(
            time / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")

        match type:
            case DBType.LONG_TERM:
                dir_path = DATA_LT_DIR_PATH
                db = self.db_lt
            case DBType.SHORT_TERM:
                dir_path = DATA_ST_DIR_PATH
                db = self.db_st
        
        partition_dir = dir_path / f"date={date_str}"
        partition_dir.mkdir(parents=True, exist_ok=True)

        # Update parquet dir
        file_path = partition_dir / f"{time}.parquet"
        df.to_parquet(file_path, engine="pyarrow", index=False, compression="zstd")

        # Update db
        db.execute("""
            INSERT INTO bazaar_data
            SELECT
                time,
                CAST(name AS VARCHAR) AS name,
                sell_price,
                sell_volume,
                sell_moving_week,
                sell_orders,
                buy_price,
                buy_volume,
                buy_moving_week,
                buy_orders
            FROM df
        """)
        db.execute("INSERT INTO ingested_files VALUES (?)", [str(file_path)])
        
        logger.info(f"Updated {type.name} database")

    def prune_short_term_data(self, epoch_ms: int) -> None:
        """
        Delete expired short-term data from both the folder and the database
        
        Args:
            epoch_ms (int): The current epoch time in milliseconds
        """
        cutoff_time = epoch_ms - 1e3*config.DATA_SHORTTERM_LIFETIME
        pruned_file_ct = 0
        pruned_paths: list[str] = []

        subdirs = [
            f for f in DATA_ST_DIR_PATH.iterdir() if f.is_dir()
        ]

        for dir in subdirs:
            dir_pruned_ct = 0
            files = [
                f for f in dir.iterdir()
                if f.is_file()
                and (f.suffix == ".parquet") 
                and f.stem.isdigit()
            ]

            for file in files:
                if int(file.stem) < cutoff_time:
                    pruned_paths.append(str(file))
                    file.unlink()
                    pruned_file_ct += 1
                    dir_pruned_ct += 1

            if dir_pruned_ct == len(files):
                # dir is now empty
                try:
                    os.chmod(dir, stat.S_IWRITE)  # add write/delete permission
                    dir.rmdir()
                except:
                    logger.warning(f"Failed to delete dir {dir.name}")
                    pass  # windows might lock the dir, will be cleaned next time

        logger.info(f"Pruned {pruned_file_ct} files in {config.DATA_SHORTTERM_DIR_PATH}")

        # also prune db_st
        if pruned_paths:
            self.db_st.execute("DELETE FROM bazaar_data WHERE time < ?", [cutoff_time])
            self.db_st.executemany(
                "DELETE FROM ingested_files WHERE file_path = ?",
                [[p] for p in pruned_paths]
            )
            logger.info(f"Pruned {len(pruned_paths)} rows-worth of files from short-term db")
