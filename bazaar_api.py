import pandas as pd
import numpy as np
import requests
import logging

from datetime import datetime, timezone
from config import config
from pathlib import Path

class BazaarAPI:
    """Manages bazaar data collection."""

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

    def write_data_frame(self, time: int, df: pd.DataFrame) -> None:
        """
        Write one data frame to parquet dataset.
        
        Args:
            time (int): Timestamp in milliseconds since epoch
            frame (pd.DataFrame): Data frame to write
        """
        date_str = datetime.fromtimestamp(
            time / 1000, tz=timezone.utc
        ).strftime("%Y-%m-%d")

        data_dir = Path(config.DATA_DIR_PATH)
        partition_dir = data_dir / f"date={date_str}"
        partition_dir.mkdir(parents=True, exist_ok=True)

        file_path = partition_dir / f"{time}.parquet"
        df.to_parquet(file_path, engine="pyarrow", index=False)