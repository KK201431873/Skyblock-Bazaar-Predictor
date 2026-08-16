from bazaar_api import BazaarAPI

bz = BazaarAPI()
time, df = bz.get_latest_data()
if time != -1:
    bz.write_data_frame(time, df)