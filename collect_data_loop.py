import time
import logging

from bazaar_api import BazaarAPI
from config import config

logger = logging.getLogger("collect_data_loop")
logger.setLevel(logging.INFO)

bz = BazaarAPI()

next_action_time = time.perf_counter_ns()
action_counter = 0

while True:
    cur_time = time.perf_counter_ns()
    if cur_time > next_action_time:
        next_action_time = cur_time + 1e9*config.DATA_COLLECTION_INTERVAL

        while True:
            if cur_time > next_action_time:
                # get_latest_data failed for entirety of wait time
                break

            timestamp, df = bz.get_latest_data()
            if timestamp != -1:
                bz.write_data_frame(timestamp, df)
                action_counter += 1
                logger.info(f"Wrote {timestamp}.parquet ({action_counter})")
                break

            # wait 1s between failed attempts
            logger.info(f"Failed to get latest data ({action_counter})...")
            time.sleep(1)