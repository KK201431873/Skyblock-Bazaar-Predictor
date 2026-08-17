import time
import logging
import sys
import signal

from data_acquisition.bazaar_api import BazaarAPI, DBType
from data_acquisition.config import config

logger = logging.getLogger("collect_data_loop")
logger.setLevel(logging.INFO)

bz = BazaarAPI()

def handle_close(signum, frame):
    bz.close()
    sys.exit(0)

signal.signal(signal.SIGINT, handle_close)

def main():
    epoch_ms = int(time.time() * 1000)
    next_data_lt_collect_time = epoch_ms
    next_data_st_collect_time = epoch_ms
    next_data_st_prune_time = epoch_ms
    
    while True:
        epoch_ms = int(time.time() * 1000)

        ## Check for data collection
        collect_lt = (epoch_ms > next_data_lt_collect_time) 
        collect_st = (epoch_ms > next_data_st_collect_time)

        if collect_lt or collect_st:
            # advance schedule
            if collect_lt:
                next_data_lt_collect_time += 1e3*config.DATA_LONGTERM_COLLECT_INTERVAL
            if collect_st:
                next_data_st_collect_time += 1e3*config.DATA_SHORTTERM_COLLECT_INTERVAL

            # try get data
            while True:
                retry_time_ms = int(time.time() * 1000)

                timeout = (retry_time_ms > next_data_lt_collect_time) or (retry_time_ms > next_data_st_collect_time)
                if timeout:
                    logger.warning(f"!!! get_latest_data failed for entirety of wait time {epoch_ms}...")
                    break

                timestamp, df = bz.get_latest_data()
                if timestamp == -1:
                    # wait between failed attempts
                    logger.warning(f"! Failed to get latest data ({epoch_ms})...")
                    time.sleep(config.DATA_COLLECT_RETRY_COOLDOWN)
                    continue

                if collect_lt:
                    bz.write_data_frame(timestamp, df, DBType.LONG_TERM)
                    bz.snapshot_db(DBType.LONG_TERM)
                    logger.info(f"Wrote & snapshotted long_term/../{timestamp}.parquet ({epoch_ms})")
                if collect_st:
                    bz.write_data_frame(timestamp, df, DBType.SHORT_TERM)
                    bz.snapshot_db(DBType.SHORT_TERM)
                    logger.info(f"Wrote & snapshotted short_term/../{timestamp}.parquet ({epoch_ms})")
                break

        ## Check for short-term data pruning
        epoch_ms = int(time.time() * 1000)

        if epoch_ms > next_data_st_prune_time:
            next_data_st_prune_time += 1e3*config.DATA_SHORTTERM_PRUNE_INTERVAL
            bz.prune_short_term_data(epoch_ms)

        # yield cpu
        time.sleep(0.1)


if __name__ == "__main__":
    main()