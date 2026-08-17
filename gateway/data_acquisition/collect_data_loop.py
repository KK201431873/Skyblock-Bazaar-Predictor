import time
import logging
import os
import stat

from data_acquisition.bazaar_api import BazaarAPI
from data_acquisition.config import config
from pathlib import Path

logger = logging.getLogger("collect_data_loop")
logger.setLevel(logging.INFO)

DATALT_DIR_PATH = Path(config.DATA_LONGTERM_DIR_PATH).resolve()
DATAST_DIR_PATH = Path(config.DATA_SHORTTERM_DIR_PATH).resolve()

bz = BazaarAPI()

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
                    bz.write_data_frame(timestamp, df, DATALT_DIR_PATH)
                    logger.info(f"Wrote long_term/../{timestamp}.parquet ({epoch_ms})")
                if collect_st:
                    bz.write_data_frame(timestamp, df, DATAST_DIR_PATH)
                    logger.info(f"Wrote short_term/../{timestamp}.parquet ({epoch_ms})")
                break

        ## Check for short-term data pruning
        epoch_ms = int(time.time() * 1000)

        if epoch_ms > next_data_st_prune_time:
            next_data_st_prune_time += 1e3*config.DATA_SHORTTERM_PRUNE_INTERVAL

            cutoff_time = epoch_ms - 1e3*config.DATA_SHORTTERM_LIFETIME
            pruned_file_ct = 0

            subdirs = [
                f for f in DATAST_DIR_PATH.iterdir() if f.is_dir()
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
                        file.unlink()
                        pruned_file_ct += 1
                        dir_pruned_ct += 1

                if dir_pruned_ct == len(files):
                    # dir is now empty
                    try:
                        os.chmod(dir, stat.S_IWRITE)  # add write permission
                        dir.rmdir()
                    except:
                        logger.warning(f"Failed to delete dir {dir.name}")
                        pass  # windows might lock the dir, will be cleaned next time

            logger.info(f"Pruned {pruned_file_ct} files in data/short_term")

        # yield cpu
        time.sleep(0.1)

if __name__ == "__main__":
    main()