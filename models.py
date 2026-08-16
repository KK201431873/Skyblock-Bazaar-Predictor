from pydantic import BaseModel, ConfigDict, computed_field
import numpy as np

class BazaarProduct(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    """Item name"""

    sell_price: np.float32
    """Weighted average of cheapest 2% sell orders by volume"""
    
    sell_volume: np.int32
    """Total number of items across sell orders"""

    sell_moving_week: np.int32
    """Total number of items instabought in the last 7 days"""

    sell_orders: np.int16
    """Total number of sell orders"""

    buy_price: np.float32
    """Weighted average of most expensive 2% buy orders by volume"""
    
    buy_volume: np.int32
    """Total number of items across buy orders"""

    buy_moving_week: np.int32
    """Total number of items instasold in the last 7 days"""

    buy_orders: np.int16
    """Total number of buy orders"""

    @computed_field
    @property
    def obj_size(self) -> int:
        """Size of object in bytes"""
        return (
            len(self.name.encode("utf-8"))
            + self.sell_price.itemsize
            + self.sell_volume.itemsize
            + self.sell_moving_week.itemsize
            + self.sell_orders.itemsize
            + self.buy_price.itemsize
            + self.buy_volume.itemsize
            + self.buy_moving_week.itemsize
            + self.buy_orders.itemsize
        )

class BazaarFrame(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    time: np.int64
    """Timestamp in milliseconds since epoch"""

    products: list[BazaarProduct]
    """Product data"""
    
    @computed_field
    @property
    def num_products(self) -> int:
        """Number of products"""
        return len(self.products)

    @computed_field
    @property
    def obj_size(self) -> int:
        """Total size of object in bytes"""
        return (
            self.time.itemsize
            + sum(product.obj_size for product in self.products)
        )