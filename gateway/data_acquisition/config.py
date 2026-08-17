import logging
import yaml

from pathlib import Path
from pydantic import BaseModel, field_validator
from simpleeval import simple_eval
from typing import Any

class Config(BaseModel):
    BAZAAR_API_URL: str
    """URL to fetch latest bazaar data"""

    DATA_LONGTERM_DIR_PATH: str
    """Parent directory for storing long-term dataset"""

    DATA_SHORTTERM_DIR_PATH: str
    """Parent directory for storing short-term dataset"""

    DATA_LONGTERM_COLLECT_INTERVAL: int
    """Time in seconds between collecting long-term data frames"""

    DATA_SHORTTERM_COLLECT_INTERVAL: int
    """Time in seconds between collecting short-term data frames"""

    DATA_SHORTTERM_LIFETIME: int
    """Time in seconds before short-term data is deleted"""

    DATA_SHORTTERM_PRUNE_INTERVAL: int
    """Time in seconds between deleting expired short-term data frames"""

    DATA_COLLECT_RETRY_COOLDOWN: float
    """Time in seconds between trying to fetch data again"""

    model_config = {
        "frozen" : True
    }

    @field_validator("DATA_LONGTERM_COLLECT_INTERVAL", "DATA_SHORTTERM_COLLECT_INTERVAL", "DATA_SHORTTERM_LIFETIME", "DATA_SHORTTERM_PRUNE_INTERVAL", mode="before")
    @classmethod
    def evaluate_interval(cls, v: Any) -> int:
        """Evaluate expression if needed"""
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, str):
            return int(simple_eval(v))
        raise ValueError("Expression must be a number or math string")

FILE_PATH  = Path(__file__).parent / "config.yaml"

try:
    with open(FILE_PATH, "r") as f:
        raw = yaml.safe_load(f)
    config = Config(**raw)
    logging.info(f"Loaded config from {FILE_PATH}")
except FileNotFoundError:
    logging.error(f"Config file not found at {FILE_PATH}")
    raise Exception(f"Config file not found at {FILE_PATH}")
    

# other files use with "from config import config"