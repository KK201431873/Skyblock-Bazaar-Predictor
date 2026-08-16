import logging
import yaml
from pathlib import Path
from pydantic import BaseModel

class Config(BaseModel):
    BAZAAR_API_URL: str
    """URL to fetch latest bazaar data"""

    DATA_DIR_PATH: str
    """Parent directory for storing dataset"""

    model_config = {
        "frozen" : True
    }

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